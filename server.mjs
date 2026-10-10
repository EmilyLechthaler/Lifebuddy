// Ida als Web-App: liefert die App aus und spricht für sie mit Claude und ElevenLabs.
// Die Schlüssel bleiben hier auf dem Server, das iPhone sieht sie nie.
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { liveRoutes, liveInfo } from "./live.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || "";
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "";
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5";
const STT_MODEL = process.env.ELEVENLABS_STT_MODEL || "scribe_v2";
const CLEANUP = process.env.STT_CLEANUP !== "0";
const MOCK = process.env.MOCK === "1";

const claude = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const app = express();
app.disable("x-powered-by");

// Nur wer das Passwort kennt, darf Claude und ElevenLabs benutzen (sonst zahlt ihr für Fremde).
function guard(req, res, next) {
  if (!APP_PASSWORD || req.get("x-ida-key") === APP_PASSWORD) return next();
  res.status(401).json({ code: "not_granted", message: "Passwort fehlt oder stimmt nicht." });
}

// Einfache Bremse: höchstens 40 Anfragen pro Minute und Gerät.
const hits = new Map();
function brake(req, res, next) {
  const k = req.ip, now = Date.now(), h = (hits.get(k) || []).filter((t) => now - t < 60000);
  h.push(now); hits.set(k, h);
  if (h.length > 40) return res.status(429).json({ code: "rate_limited", message: "Kurz durchatmen, gleich geht es weiter." });
  next();
}

app.get("/api/ping", (req, res) => {
  res.json({ ok: true, password: !!APP_PASSWORD, ai: !!claude || MOCK, voice: !!ELEVEN_KEY && !!VOICE_ID, ear: !!ELEVEN_KEY || MOCK, ...liveInfo() });
});

app.post("/api/check", express.json(), (req, res) => {
  res.json({ ok: !APP_PASSWORD || req.body?.key === APP_PASSWORD });
});

/* ---------- Claude ---------- */

// Der Prototyp schickt Nachrichten so, wie die Artifact-Seite sie an Claude gab.
// Hier werden sie für die API geordnet: gleiche Rollen hintereinander zusammengelegt, Bilder an die letzte Frage gehängt.
function toMessages(input, images) {
  const list = typeof input === "string" ? [{ role: "user", content: input }] : Array.isArray(input) ? input : [];
  const out = [];
  for (const m of list) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const text = typeof m.content === "string" ? m.content : String(m.content ?? "");
    if (!text.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content[0].text += "\n\n" + text;
    else out.push({ role: m.role, content: [{ type: "text", text }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  while (out.length && out[out.length - 1].role !== "user") out.pop();
  if (out.length && images?.length) {
    const pics = images.slice(0, 4).filter((i) => /^image\/(png|jpeg|gif|webp)$/.test(i.media_type) && i.data)
      .map((i) => ({ type: "image", source: { type: "base64", media_type: i.media_type, data: i.data } }));
    out[out.length - 1].content.unshift(...pics);
  }
  return out;
}

const EFFORT = { quick: "low", default: "medium", complex: "high" };

app.post("/api/sample", guard, brake, express.json({ limit: "20mb" }), async (req, res) => {
  const { input, modelTier, images } = req.body || {};
  const messages = toMessages(input, images);
  if (!messages.length) return res.status(400).json({ code: "bad_input", message: "Leere Frage." });
  res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  const send = (o) => res.write(JSON.stringify(o) + "\n");

  if (MOCK || !claude) {
    if (!MOCK) { send({ error: { code: "sampling_disabled", message: "Kein Claude-Schlüssel auf dem Server." } }); return res.end(); }
    const t = "Das ist eine Probeantwort ohne echte KI. Sobald der Claude-Schlüssel eingetragen ist, antworte ich richtig.";
    for (const w of t.split(" ")) { send({ d: w + " " }); await new Promise((r) => setTimeout(r, 25)); }
    send({ done: true, stop: "end_turn" }); return res.end();
  }

  const ctl = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ctl.abort(); });
  try {
    const stream = claude.beta.messages.stream({
      model: MODEL,
      max_tokens: modelTier === "complex" ? 16000 : 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT[modelTier] || "low" },
      system: "Latency-sensitive; begin your visible answer immediately.",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    }, { signal: ctl.signal });
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") send({ d: ev.delta.text });
    }
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") send({ error: { code: "refused", message: "Darauf kann ich so nicht antworten." } });
    else send({ done: true, stop: msg.stop_reason });
  } catch (e) {
    if (ctl.signal.aborted) return res.end();
    let code = "error";
    if (e instanceof Anthropic.RateLimitError) code = "rate_limited";
    else if (e instanceof Anthropic.AuthenticationError) code = "sampling_disabled";
    else if (e instanceof Anthropic.APIError && e.status >= 500) code = "unavailable";
    console.error("claude:", e?.status, e?.message);
    send({ error: { code, message: "Claude ist gerade nicht erreichbar." } });
  }
  res.end();
});

/* ---------- ElevenLabs: Ida spricht ---------- */

app.post("/api/tts", guard, brake, express.json({ limit: "64kb" }), async (req, res) => {
  const text = String(req.body?.text || "").slice(0, 2500).trim();
  if (!text) return res.status(400).end();
  if (!ELEVEN_KEY || !VOICE_ID) return res.status(503).json({ code: "no_voice" });
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}/stream?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": ELEVEN_KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: TTS_MODEL, language_code: "de" }),
    });
    if (!r.ok || !r.body) { console.error("tts:", r.status, await r.text().catch(() => "")); return res.status(502).json({ code: "voice_failed" }); }
    res.setHeader("content-type", "audio/mpeg");
    res.setHeader("cache-control", "no-store");
    Readable.fromWeb(r.body).pipe(res);
  } catch (e) {
    console.error("tts:", e?.message);
    res.status(502).json({ code: "voice_failed" });
  }
});

/* ---------- ElevenLabs Scribe plus Claude: Ida hört zu, wie Wispr ---------- */

const CLEAN = "Du bekommst eine automatische Abschrift von gesprochener Sprache, oft Vorarlbergerisch oder ein anderer Dialekt. " +
  "Gib nur den bereinigten Satz auf Hochdeutsch zurück, so wie die Person ihn gemeint hat: Füllwörter (äh, ähm, also halt) raus, Versprecher und Wiederholungen weg, " +
  "Satzzeichen und Großschreibung richtig. Wenn die Person sich korrigiert (\"nein, ich meine …\"), nimm nur die Korrektur. " +
  "Ändere nie die Bedeutung, beantworte nichts, füge nichts hinzu. Keine Anführungszeichen, keine Erklärung.";

app.post("/api/stt", guard, brake, express.raw({ type: () => true, limit: "15mb" }), async (req, res) => {
  const audio = req.body;
  if (!audio?.length) return res.status(400).json({ code: "no_audio" });
  if (MOCK) return res.json({ raw: "äh guten morgen ida", text: "Guten Morgen, Ida." });
  if (!ELEVEN_KEY) return res.status(503).json({ code: "no_ear" });
  try {
    const type = (req.get("content-type") || "audio/webm").split(";")[0];
    const ext = /mp4|m4a|aac/.test(type) ? "m4a" : /ogg/.test(type) ? "ogg" : /wav/.test(type) ? "wav" : "webm";
    const fd = new FormData();
    fd.append("model_id", STT_MODEL);
    fd.append("language_code", "deu");
    fd.append("tag_audio_events", "false");
    fd.append("timestamps_granularity", "none");
    fd.append("file", new Blob([audio], { type }), "ida." + ext);
    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": ELEVEN_KEY }, body: fd });
    if (!r.ok) { console.error("stt:", r.status, await r.text().catch(() => "")); return res.status(502).json({ code: "ear_failed" }); }
    const raw = String((await r.json()).text || "").trim();
    if (!raw || !CLEANUP || !claude) return res.json({ raw, text: raw });
    const m = await claude.messages.create({
      model: MODEL, max_tokens: 1000, output_config: { effort: "low" },
      system: CLEAN, messages: [{ role: "user", content: raw }],
    });
    const text = m.stop_reason === "refusal" ? raw : m.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim() || raw;
    res.json({ raw, text });
  } catch (e) {
    console.error("stt:", e?.status, e?.message);
    res.status(502).json({ code: "ear_failed" });
  }
});

liveRoutes(app, { guard, brake, MOCK });

app.use(express.static(path.join(here, "public"), { extensions: ["html"], setHeaders: (res, p) => { if (p.endsWith(".html")) res.setHeader("cache-control", "no-cache"); } }));

app.listen(PORT, () => console.log(`Ida läuft auf Port ${PORT}${MOCK ? " (Probemodus ohne Schlüssel)" : ""}`));

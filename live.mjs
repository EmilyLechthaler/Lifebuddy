// Echte Daten für Ida: Ort, Wetter (Open-Meteo, ohne Schlüssel) und Kalender (ICS-Link aus Google oder iCloud).
import IcalExpander from "ical-expander";

const TZ = process.env.APP_TZ || "Europe/Vienna";
const UA = "Ida-LifeBuddy/0.1 (https://github.com/EmilyLechthaler/Lifebuddy)";
// Ein oder mehrere Kalender-Links, mit Komma oder Leerzeichen getrennt. webcal:// wird zu https://.
const CAL_URLS = String(process.env.CALENDAR_ICS_URL || "").split(/[\s,]+/).filter(Boolean).map((u) => u.replace(/^webcal:/i, "https:"));

const cache = new Map();
async function cached(key, ms, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ms) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}
async function getJSON(url) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(url.split("?")[0] + " " + r.status);
  return r.json();
}
const num = (v) => (Number.isFinite(+v) ? +v : null);
const round = (v) => (v == null ? "–" : Math.round(v) + "°");

/* ---------- Wetter ---------- */

// WMO-Wettercodes, wie Open-Meteo sie liefert: [Symbol tags, Symbol nachts, Beschreibung]
const WMO = {
  0: ["☀️", "🌙", "Klar"], 1: ["🌤️", "🌙", "Überwiegend klar"], 2: ["⛅", "☁️", "Teilweise bewölkt"], 3: ["☁️", "☁️", "Bewölkt"],
  45: ["🌫️", "🌫️", "Nebel"], 48: ["🌫️", "🌫️", "Nebel mit Reif"],
  51: ["🌦️", "🌧️", "Leichter Nieselregen"], 53: ["🌦️", "🌧️", "Nieselregen"], 55: ["🌧️", "🌧️", "Starker Nieselregen"],
  56: ["🌧️", "🌧️", "Gefrierender Niesel"], 57: ["🌧️", "🌧️", "Gefrierender Niesel"],
  61: ["🌦️", "🌧️", "Leichter Regen"], 63: ["🌧️", "🌧️", "Regen"], 65: ["🌧️", "🌧️", "Starker Regen"],
  66: ["🌧️", "🌧️", "Gefrierender Regen"], 67: ["🌧️", "🌧️", "Gefrierender Regen"],
  71: ["🌨️", "🌨️", "Leichter Schneefall"], 73: ["🌨️", "🌨️", "Schneefall"], 75: ["❄️", "❄️", "Starker Schneefall"], 77: ["🌨️", "🌨️", "Schneegriesel"],
  80: ["🌦️", "🌧️", "Regenschauer"], 81: ["🌧️", "🌧️", "Kräftige Schauer"], 82: ["⛈️", "⛈️", "Heftige Schauer"],
  85: ["🌨️", "🌨️", "Schneeschauer"], 86: ["❄️", "❄️", "Starke Schneeschauer"],
  95: ["⛈️", "⛈️", "Gewitter"], 96: ["⛈️", "⛈️", "Gewitter mit Hagel"], 99: ["⛈️", "⛈️", "Starkes Gewitter mit Hagel"],
};
const wmo = (c, day = 1) => { const w = WMO[c] || WMO[2]; return { i: day ? w[0] : w[1], d: w[2] }; };
const hhmm = (iso) => (iso ? String(iso).slice(11, 16).replace(/^0/, "") : "–");
const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function uvText(u) { if (u == null) return "–"; const n = Math.round(u); return n + " · " + (n < 3 ? "niedrig" : n < 6 ? "mäßig" : n < 8 ? "hoch" : n < 11 ? "sehr hoch" : "extrem"); }
function airText(a) { if (a == null) return "–"; return a <= 20 ? "sehr gut" : a <= 40 ? "gut" : a <= 60 ? "mittel" : a <= 80 ? "schlecht" : "sehr schlecht"; }

async function weather(lat, lon) {
  const f = await getJSON("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
    "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day,precipitation" +
    "&hourly=temperature_2m,weather_code,precipitation_probability,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum" +
    "&timezone=auto&forecast_days=5&wind_speed_unit=kmh");
  let aqi = null;
  try { aqi = num((await getJSON("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + lat + "&longitude=" + lon + "&current=european_aqi")).current?.european_aqi); } catch {}
  return shapeWeather(f, aqi);
}

// Formt die Open-Meteo-Antwort in das, was Idas Wetterfenster zeigt, plus Klartext für Claude.
export function shapeWeather(f, aqi) {
  const c = f.current || {}, h = f.hourly || {}, d = f.daily || {};
  const nowIso = String(c.time || "").slice(0, 13);
  let i0 = (h.time || []).findIndex((t) => String(t).slice(0, 13) === nowIso); if (i0 < 0) i0 = 0;
  const hours = [];
  for (let i = i0; i < Math.min((h.time || []).length, i0 + 6); i++) {
    hours.push([i === i0 ? "jetzt" : String(+String(h.time[i]).slice(11, 13)), wmo(h.weather_code[i], h.is_day?.[i]).i, round(h.temperature_2m[i])]);
  }
  let rainAt = null;
  for (let i = i0; i < Math.min((h.time || []).length, i0 + 12); i++) if ((h.precipitation_probability?.[i] ?? 0) >= 50) { rainAt = hhmm(h.time[i]); break; }
  const now = wmo(c.weather_code, c.is_day);
  const tomorrow = (d.time || []).length > 1 ? 1 : 0;
  const days = (d.time || []).slice(1, 4).map((t, k) => [DAYS[new Date(t + "T12:00:00Z").getUTCDay()], wmo(d.weather_code[k + 1]).i, Math.round(d.temperature_2m_min[k + 1]) + "° bis " + Math.round(d.temperature_2m_max[k + 1]) + "°"]);
  const rainToday = d.precipitation_probability_max?.[0];
  const out = {
    now: round(c.temperature_2m), d: now.d, icon: now.i,
    hl: "Höchstens " + round(d.temperature_2m_max?.[0]) + ", tiefst " + round(d.temperature_2m_min?.[0]),
    hours,
    tiles: [["auf", "Sonnenaufgang", hhmm(d.sunrise?.[tomorrow])], ["unter", "Sonnenuntergang", hhmm(d.sunset?.[0])], ["regen", "Regen", (rainToday ?? "–") + " %"],
      ["wind", "Wind", Math.round(c.wind_speed_10m ?? 0) + " km/h"], ["uv", "UV-Index", uvText(d.uv_index_max?.[0])], ["luft", "Luft", airText(aqi)]],
    days,
  };
  const tmr = d.time?.[1] ? wmo(d.weather_code[1]).d + ", " + Math.round(d.temperature_2m_min[1]) + " bis " + Math.round(d.temperature_2m_max[1]) + " Grad, Regenrisiko " + (d.precipitation_probability_max?.[1] ?? "?") + " %" : "";
  out.answers = {
    now: "Gerade " + Math.round(c.temperature_2m) + " Grad, " + now.d.toLowerCase() + ". Heute höchstens " + Math.round(d.temperature_2m_max?.[0]) + "." + (rainAt ? " Ab etwa " + rainAt + " kann es regnen." : ""),
    unter: "Heute um " + hhmm(d.sunset?.[0]) + ".",
    auf: (tomorrow ? "Morgen" : "Heute") + " um " + hhmm(d.sunrise?.[tomorrow]) + ".",
    regen: rainAt ? "Ab etwa " + rainAt + " wird es wahrscheinlich nass, nimm einen Schirm mit." : "Heute eher nicht, das Regenrisiko liegt bei " + (rainToday ?? 0) + " Prozent." + (tmr ? " Morgen: " + tmr + "." : ""),
    wind: "Gerade " + Math.round(c.wind_speed_10m ?? 0) + " Kilometer pro Stunde.",
    uv: "UV-Index heute " + uvText(d.uv_index_max?.[0]).replace(" · ", ", also ") + ".",
    luft: aqi == null ? "Zur Luftqualität habe ich gerade keine Daten." : "Die Luft ist " + airText(aqi) + " (Index " + Math.round(aqi) + ").",
  };
  out.text = "Jetzt " + Math.round(c.temperature_2m) + " Grad (gefühlt " + Math.round(c.apparent_temperature ?? c.temperature_2m) + "), " + now.d +
    ". Heute " + Math.round(d.temperature_2m_min?.[0]) + " bis " + Math.round(d.temperature_2m_max?.[0]) + " Grad, Regenrisiko " + (rainToday ?? "?") + " %" + (rainAt ? ", Regen ab etwa " + rainAt : "") +
    ". Sonnenuntergang " + hhmm(d.sunset?.[0]) + ", UV " + uvText(d.uv_index_max?.[0]) + ", Wind " + Math.round(c.wind_speed_10m ?? 0) + " km/h." + (tmr ? " Morgen: " + tmr + "." : "") +
    (days.length ? " Danach: " + days.slice(1).map((x) => x[0] + " " + x[2]).join(", ") + "." : "");
  return out;
}

/* ---------- Ort ---------- */

async function place(lat, lon) {
  const r = await getJSON("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=de&lat=" + lat + "&lon=" + lon);
  const a = r.address || {};
  return { ort: a.village || a.town || a.city || a.municipality || a.suburb || a.county || "", land: a.country || "" };
}
async function geocode(q) {
  const r = await getJSON("https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&format=json&name=" + encodeURIComponent(q));
  const g = r.results?.[0];
  return g ? { lat: g.latitude, lon: g.longitude, ort: g.name, land: g.country || "" } : null;
}

/* ---------- Kalender ---------- */

const fmtDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtTime = new Intl.DateTimeFormat("de-AT", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const KIND = [["geburtstag", /geburtstag|birthday|🎂/i], ["gesundheit", /arzt|ärztin|zahnarzt|dr\.|physio|therap|praxis|termin bei|impf|kontrolle/i],
  ["familie", /mama|papa|oma|opa|familie|kind|schule|kindergarten|elternabend|abholen/i],
  ["sport", /sport|yoga|pilates|training|gym|fitness|lauf|klettern|schwimm|tennis|fußball|turnen|heels|tanz/i],
  ["arbeit", /meeting|büro|kunde|call|präsentation|workshop|besprechung|projekt|team|jour fixe|zoom|teams/i],
  ["einkauf", /einkauf|einkaufen|shopping|spar|billa|hofer|lidl|markt/i], ["frist", /frist|deadline|fällig|zahlen|kündig|abgabe/i]];
const kindOf = (t) => (KIND.find((k) => k[1].test(t)) || ["persoenlich"])[0];

function shapeEvent(ev, startDate, endDate) {
  const allDay = startDate.isDate;
  const s = startDate.toJSDate(), e = endDate ? endDate.toJSDate() : s;
  const title = String(ev.summary || "Termin").trim();
  const date = allDay ? startDate.toString().slice(0, 10) : fmtDay.format(s);
  return {
    date, time: allDay ? "" : fmtTime.format(s), hours: allDay ? 0 : Math.max(0.25, Math.min(14, (e - s) / 36e5)),
    end: allDay ? "" : fmtTime.format(e), title, where: String(ev.location || "").split("\n")[0].trim(), kind: kindOf(title),
  };
}

async function calendar(from, to) {
  const all = [];
  for (const url of CAL_URLS) {
    const ics = await cached("ics:" + url, 5 * 60e3, async () => {
      const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error("Kalender " + r.status);
      return r.text();
    });
    const x = new IcalExpander({ ics, maxIterations: 400 }).between(from, to);
    for (const ev of x.events) all.push(shapeEvent(ev, ev.startDate, ev.endDate));
    for (const o of x.occurrences) all.push(shapeEvent(o.item, o.startDate, o.endDate));
  }
  const seen = new Set();
  return all.filter((e) => { const k = e.date + e.time + e.title; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.date + (a.time || "00:00").padStart(5, "0")).localeCompare(b.date + (b.time || "00:00").padStart(5, "0")));
}

/* ---------- Routen ---------- */

export const liveInfo = () => ({ wx: true, cal: CAL_URLS.length > 0, tz: TZ });

export function liveRoutes(app, { guard, brake, MOCK }) {
  const coords = (q) => { const lat = num(q.lat), lon = num(q.lon); return lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat.toFixed(3), lon.toFixed(3)] : null; };

  // Ort aus Koordinaten oder aus dem Wohnort-Namen.
  app.get("/api/ort", guard, brake, async (req, res) => {
    try {
      if (MOCK) return res.json({ lat: 47.517, lon: 9.733, ort: "Lochau", land: "Österreich" });
      const c = coords(req.query);
      if (c) return res.json({ lat: +c[0], lon: +c[1], ...(await cached("ort:" + c, 864e5, () => place(c[0], c[1]))) });
      const q = String(req.query.q || "").split(",")[0].trim().slice(0, 80);
      if (!q) return res.status(400).json({ code: "no_place" });
      const g = await cached("geo:" + q.toLowerCase(), 864e5, () => geocode(q));
      if (!g) return res.status(404).json({ code: "not_found" });
      res.json(g);
    } catch (e) { console.error("ort:", e?.message); res.status(502).json({ code: "place_failed" }); }
  });

  app.get("/api/wetter", guard, brake, async (req, res) => {
    const c = coords(req.query);
    if (!c) return res.status(400).json({ code: "no_coords" });
    try {
      if (MOCK) return res.json(shapeWeather(MOCK_WX, 28));
      res.json(await cached("wx:" + c, 10 * 60e3, () => weather(c[0], c[1])));
    } catch (e) { console.error("wetter:", e?.message); res.status(502).json({ code: "weather_failed" }); }
  });

  app.get("/api/kalender", guard, brake, async (req, res) => {
    const from = new Date(String(req.query.from || "")), to = new Date(String(req.query.to || ""));
    if (isNaN(from) || isNaN(to) || to <= from || to - from > 120 * 864e5) return res.status(400).json({ code: "bad_range" });
    try {
      if (MOCK && !CAL_URLS.length) return res.json({ events: mockCal(from) });
      if (!CAL_URLS.length) return res.status(503).json({ code: "no_calendar" });
      res.json({ events: await calendar(from, to) });
    } catch (e) { console.error("kalender:", e?.message); res.status(502).json({ code: "calendar_failed" }); }
  });
}

/* ---------- Probedaten für MOCK=1 (nur zum Testen am Computer) ---------- */

const MOCK_WX = (() => {
  const d = new Date(), day = d.toISOString().slice(0, 10), H = d.getUTCHours();
  const hours = Array.from({ length: 48 }, (_, i) => { const t = new Date(Date.parse(day + "T00:00:00Z") + i * 36e5).toISOString().slice(0, 16); return t; });
  return {
    current: { time: day + "T" + String(H).padStart(2, "0") + ":00", temperature_2m: 12.4, apparent_temperature: 10.8, weather_code: 2, wind_speed_10m: 9, is_day: 1 },
    hourly: { time: hours, temperature_2m: hours.map((_, i) => 8 + 6 * Math.sin((i % 24 - 9) / 24 * Math.PI * 2)), weather_code: hours.map((_, i) => (i % 24 > 17 ? 61 : 2)), precipitation_probability: hours.map((_, i) => (i % 24 > 17 ? 70 : 10)), is_day: hours.map((_, i) => (i % 24 > 6 && i % 24 < 19 ? 1 : 0)) },
    daily: { time: [0, 1, 2, 3, 4].map((k) => new Date(Date.parse(day) + k * 864e5).toISOString().slice(0, 10)), weather_code: [2, 63, 3, 0, 1], temperature_2m_max: [15, 11, 13, 17, 16], temperature_2m_min: [6, 7, 5, 4, 6],
      sunrise: [day + "T07:31", day + "T07:32"], sunset: [day + "T18:41", day + "T18:39"], uv_index_max: [2.8, 1.2, 2, 3, 3], precipitation_probability_max: [70, 90, 30, 5, 10] },
  };
})();
function mockCal(from) {
  const d = (n) => fmtDay.format(new Date(from.getTime() + n * 864e5));
  return [{ date: d(1), time: "9:00", hours: 1, end: "10:00", title: "Probetermin: Teammeeting", where: "Büro", kind: "arbeit" },
    { date: d(2), time: "18:30", hours: 1, end: "19:30", title: "Probetermin: Pilates", where: "", kind: "sport" }];
}

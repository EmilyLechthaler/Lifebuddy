# Ida, die Life Buddy Web-App

Ida läuft als Web-App im Browser und lässt sich am iPhone wie eine App auf den Home-Bildschirm legen.
Claude denkt mit, ElevenLabs gibt Ida ihre Stimme und schreibt mit, was du sagst (wie Wispr: Füllwörter raus, Dialekt verstanden, sauberer Satz).

Die Schlüssel für Claude und ElevenLabs liegen nur auf dem Server bei Render. Das iPhone sieht sie nie.

## Auf Render online stellen

1. Auf [render.com](https://render.com) anmelden (mit GitHub).
2. **New → Blueprint**, das Repository `Lifebuddy` wählen. Render liest `render.yaml` und legt den Dienst `ida` an (Region Frankfurt).
3. Render fragt nach diesen Werten. Eintragen und speichern:

| Name | Was | Woher |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude-Schlüssel | [console.anthropic.com](https://console.anthropic.com) → API Keys. Wird extra abgerechnet, nicht über das Claude-Abo. |
| `ELEVENLABS_API_KEY` | ElevenLabs-Schlüssel | elevenlabs.io → Profil → API Keys |
| `ELEVENLABS_VOICE_ID` | Idas Stimme | elevenlabs.io → Voices → Stimme wählen → „ID kopieren“ |
| `APP_PASSWORD` | Passwort für die App | frei wählen, damit nur ihr Ida benutzt (und zahlt) |

4. Nach dem Bauen zeigt Render eine Adresse wie `https://ida-xxxx.onrender.com`. Die am iPhone in **Safari** öffnen, Passwort eingeben.
5. In Safari **Teilen → Zum Home-Bildschirm**. Ab jetzt startet Ida wie eine App, ohne Adressleiste.

Der Plan `starter` kostet bei Render 7 $ im Monat und schläft nie ein. Zum Ausprobieren geht auch `free`, dann braucht Ida nach einer Pause etwa eine Minute zum Aufwachen.

## Echte Daten

- **Uhrzeit** kommt vom Handy.
- **Ort**: Ida fragt beim ersten Tippen nach deinem Standort. Sagst du nein, nimmt sie den Wohnort aus dem Kennenlernen.
- **Wetter** kommt live von Open-Meteo, dafür braucht es keinen Schlüssel.
- **Kalender**: Trag bei Render `CALENDAR_ICS_URL` ein, die geheime iCal-Adresse deines Kalenders. Bei Google: Kalender-Einstellungen, dein Kalender, „Privatadresse im iCal-Format“. Bei iCloud: in der Kalender-App beim Kalender auf das Info-Symbol, „Öffentlicher Kalender“ einschalten und den Link kopieren. Mehrere Adressen trennst du mit Komma. Ida liest nur, sie trägt nichts in deinen Kalender ein.
- **Nachrichten**: Ida schreibt vor, du schickst selbst per WhatsApp oder SMS. Kontakte und eingehende Nachrichten kann eine Web-App nicht lesen.

## Einstellungen (optional)

| Name | Standard | Wofür |
|---|---|---|
| `CLAUDE_MODEL` | `claude-opus-5-5` | Günstiger: `claude-haiku-5-5` |
| `ELEVENLABS_TTS_MODEL` | `eleven_flash_v2_5` | Schnellste Stimme, ca. 0,5 Credit pro Zeichen |
| `ELEVENLABS_STT_MODEL` | `scribe_v2` | Mitschreiben |
| `STT_CLEANUP` | an | `0` schaltet das Aufräumen durch Claude aus |
| `APP_TZ` | `Europe/Vienna` | Zeitzone für Kalendertermine |

## Am Computer ausprobieren

```
npm install
npm run probe        # ohne Schlüssel, mit Probeantworten
```

Dann `http://localhost:3000` öffnen. Mit echten Schlüsseln: dieselben Namen als Umgebungsvariablen setzen und `npm start`.

## Aufbau

- `server.mjs` liefert die App aus und spricht mit Claude (`/api/sample`), ElevenLabs-Stimme (`/api/tts`) und ElevenLabs-Mitschrift plus Claude-Aufräumen (`/api/stt`).
- `public/index.html` ist der Prototyp, fertig gebaut.
- `public/ida-shim.js` verbindet den Prototyp mit dem Server und fragt das Passwort ab.
- `src/app.js` schaltet die echte Stimme und das echte Zuhören ein, `src/live.js` echte Uhr, Ort, Wetter, Kalender und das Weiterschicken von Nachrichten.
- `live.mjs` holt Ort, Wetter und Kalender auf dem Server.
- `tools/build.py` baut `public/index.html` neu aus `tools/prototyp.html` und `src/`.

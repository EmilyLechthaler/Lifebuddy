# Baut public/index.html der Web-App aus dem Prototyp (tools/prototyp.html) plus App-Teil:
# src/app.js (echte Stimme, echtes Zuhören) und src/live.js (echte Uhr, Ort, Wetter, Kalender).
# Aufruf im Projektordner: python3 tools/build.py
import sys
src = open('tools/prototyp.html', encoding='utf-8').read()
app = open('src/app.js', encoding='utf-8').read() + '\n' + open('src/live.js', encoding='utf-8').read()
mark = "drawJulia(); drawFg(); $('say').textContent = ''; applyName();"
assert src.count(mark) == 1
s = src.replace(mark, app + '\n' + mark)
# Hinweise aus dem Prototyp, die in der App nicht mehr stimmen
s = s.replace('Tippen zum Sprechen · im Prototyp wird dein Satz vorgespielt', 'Tippen zum Sprechen')
old = 'Prototyp. Sprechen wird vorgespielt. Tippen geht über das Tastatur-Symbol unten links, dort antwortet die KI wirklich. Alle Zeiten, Preise und Lokale sind Beispiele.'
assert old in s
s = s.replace(old, 'Gestalte zuerst deinen eigenen Buddy. Danach sind Uhrzeit, Ort und Wetter echt. Der Beispieltag ist eine Vorführung mit ausgedachten Zeiten und Orten.')
assert s.startswith('<title>')
head = ('<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n'
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="Ida">\n'
  '<meta name="theme-color" content="#04050C">\n<link rel="manifest" href="/manifest.webmanifest">\n'
  '<link rel="apple-touch-icon" href="/icon-180.png">\n<link rel="icon" href="/icon-192.png">\n'
  '<style>html,body{margin:0}body{-webkit-tap-highlight-color:transparent;overscroll-behavior:none}'
  '#ida-key{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(4,5,12,.86);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-family:Sora,system-ui,sans-serif;color:#EEF0FF;padding:16px}'
  '#ida-key>div{display:flex;flex-direction:column;gap:10px;width:min(340px,100%);padding:22px;border-radius:22px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)}'
  '#ida-key b{font-size:18px}#ida-key span{font-size:14px;color:#B9BDD6;line-height:1.4}#ida-key em{font-style:normal;font-size:13px;color:#FF9B9B}'
  '#ida-key input{font:inherit;font-size:16px;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.3);color:inherit}'
  '#ida-key button{font:inherit;font-size:15px;font-weight:600;padding:12px;border:0;border-radius:14px;background:linear-gradient(160deg,#F7F5FF,#D5CFF4 55%,#BDB4EC);color:#151233}</style>\n'
  '<script src="/ida-shim.js"></script>\n')
out = head + s.replace('<title>LiveBuddy mit Ida</title>', '<title>Ida</title>', 1) + '\n</body>\n</html>\n'
# Kopf und Körper trennen: alles ab dem ersten Element nach dem Stylesheet gehört in den Body
i = out.index('</style>', out.index('<title>Ida</title>'))
# erstes </style> nach dem Titel beendet den Prototyp-Stil; danach beginnt der sichtbare Teil
out = out[:i + 8] + '\n</head>\n<body>\n' + out[i + 8:]
open('public/index.html', 'w', encoding='utf-8').write(out)
print('ok', len(out))

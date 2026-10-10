/* ---------- Echte Daten: Uhr, Ort, Wetter und Kalender statt Beispielen ---------- */
var REAL = { ort:null, wx:null, wxAt:'', cal:null };
function rq(u){ return fetch(u, { headers:IDA_APP.headers() }).then(function(r){ if (!r.ok) throw r.status; return r.json(); }); }
function locDay(d){ d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function lsGet(k){ try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} }

/* Uhr: echte Zeit. Nur die vorgespielten Situationen behalten ihre eigene Uhrzeit. */
function tick(){ if (LIVE) return; var n = new Date();
  $('clk').textContent = n.toLocaleTimeString('de-AT', { hour:'numeric', minute:'2-digit' });
  $('clkd').textContent = n.toLocaleDateString('de-AT', { weekday:'long', day:'numeric', month:'long' }) + (REAL.ort && REAL.ort.ort ? ' · ' + REAL.ort.ort : ''); }
var setClockDemo = setClock;
setClock = function(c){ if (LIVE) return setClockDemo(c); tick(); };
setInterval(tick, 15000);

/* Ort: genau übers Handy, wenn erlaubt, sonst der Wohnort aus dem Kennenlernen. */
function ortSet(o){ if (!o || o.lat == null) return; REAL.ort = o; lsSet('ida.ort', o); if (o.ort) WXD.ort = o.ort; tick(); wxLoad(); }
function ortLoad(){ var wo = (J.me && J.me.wo) || ''; if (!REAL.ort && wo) rq('/api/ort?q=' + encodeURIComponent(wo)).then(function(o){ if (!REAL.ort || !REAL.ort.gps) ortSet(o); }, function(){}); }
var GEO = false;
function geoAsk(){ if (GEO || !navigator.geolocation) return; GEO = true;
  navigator.geolocation.getCurrentPosition(function(p){ var c = p.coords;
    rq('/api/ort?lat=' + c.latitude + '&lon=' + c.longitude).then(function(o){ o.gps = 1; ortSet(o); }, function(){ ortSet({ lat:c.latitude, lon:c.longitude, ort:(REAL.ort && REAL.ort.ort) || '', gps:1 }); }); },
    function(){}, { maximumAge:600000, timeout:15000 }); }
document.addEventListener('pointerdown', geoAsk, true);

/* Wetter: live von Open-Meteo, in Idas Wetterfenster und in ihren Antworten. */
function wxLoad(){ var o = REAL.ort; if (!o) return;
  rq('/api/wetter?lat=' + o.lat + '&lon=' + o.lon).then(function(w){ REAL.wx = w; REAL.wxAt = new Date().toLocaleTimeString('de-AT', { hour:'numeric', minute:'2-digit' });
    WXD.now = w.now; WXD.d = w.d; WXD.hl = w.hl; WXD.hours = w.hours; WXD.tiles = w.tiles; WXD.days = w.days;
    Object.keys(w.answers || {}).forEach(function(k){ WXA[k] = w.answers[k]; });
    Object.keys(WINS).forEach(function(id){ if (WINS[id].k === 'wetter' && $(id)) $(id).innerHTML = WX.wetter(WINS[id].o, id); }); }, function(){}); }
setInterval(wxLoad, 15 * 60000);
var wxDraw = WX.wetter;
WX.wetter = function(o, id){ var h = wxDraw(o, id); if (!REAL.wx) return h;
  return h.replace('Apple Wetter · ', 'Live · ').replace(/Beispieldaten\. In der App kommen sie aus Apple Wetter\./, 'Live von Open-Meteo, Stand ' + REAL.wxAt + ' Uhr.'); };

/* Kalender: echte Termine aus dem verknüpften Kalender (Google oder iCloud), sonst bleiben die Beispiele. */
function calLoad(){ if (!APPV.cal) return; var a = new Date(), b = new Date(); a.setDate(a.getDate() - 28); b.setDate(b.getDate() + 70);
  rq('/api/kalender?from=' + a.toISOString() + '&to=' + b.toISOString()).then(function(r){
    REAL.cal = (r.events || []).map(function(e){ var t = e.kind === 'geburtstag' ? (e.title.replace(/(geburtstag|birthday)\s*(von|of)?\s*:?/i, '').replace(/[‘’']s\s*$/, '').trim() || e.title) : e.title;
      return [e.date, e.time, e.hours, t, e.kind, e.where || '', e.end || '']; });
    var id = weekWin(); if (id) weekDraw(id); }, function(){}); }
setInterval(calLoad, 10 * 60000);
var weekEvDemo = weekEv;
weekEv = function(mon){ if (!REAL.cal || LIVE) return weekEvDemo(mon); var end = addD(mon, 6);
  return REAL.cal.concat(J.calx || []).filter(function(e){ return e[0] >= mon && e[0] <= end; }); };
var todayIsoDemo = todayIso;
todayIso = function(){ return REAL.cal && !LIVE ? locDay() : todayIsoDemo(); };
var weekOpenDemo = weekOpen;
weekOpen = function(o){ if (!REAL.cal || LIVE || weekWin()) return weekOpenDemo(o); return winOpen('woche', Object.assign({ today:locDay() }, o || {})); };
var weekWinDraw = WX.woche;
WX.woche = function(o, id){ return weekWinDraw(o, id) + (LIVE ? '' : '<div class="fine">' + (REAL.cal ? 'Live aus deinem Kalender.' : 'Beispieltermine, bis dein Kalender verbunden ist.') + '</div>'); };

/* Claude bekommt die echten Daten mit, damit Ida nichts erfinden muss. */
function calText(){ if (!REAL.cal) return ''; var t = locDay(), end = addD(t, 7);
  var ev = REAL.cal.filter(function(e){ return e[0] >= t && e[0] <= end; }).slice(0, 40);
  if (!ev.length) return 'Ihr Kalender (echt): In den nächsten sieben Tagen steht nichts drin.';
  return 'Ihr Kalender (echt, nächste sieben Tage): ' + ev.map(function(e){ return dfmt(e[0], { weekday:'short', day:'numeric', month:'numeric' }) + ' ' + (e[1] ? e[1] + (e[6] ? '–' + e[6] : '') : 'ganztägig') + ' ' + e[3] + (e[5] ? ' (' + e[5] + ')' : ''); }).join('; ') + '.'; }
var rulesBase = rules;
rules = function(){ var r = rulesBase(), x = [], has = [];
  if (REAL.wx) has.push('ihr echtes Wetter'); if (REAL.cal) has.push('ihren echten Kalender');
  if (has.length) r = r.replace('Im Prototyp hast du keinen Zugriff auf Fahrpläne, Wetter, Öffnungszeiten, Kalender oder das Internet.',
    'Du kennst ' + has.join(' und ') + ' (siehe oben). Keinen Zugriff hast du auf ' + (REAL.cal ? '' : 'ihren Kalender, ') + 'Fahrpläne, Öffnungszeiten oder das Internet.');
  if (REAL.ort && REAL.ort.ort) x.push('Sie ist gerade in oder bei ' + REAL.ort.ort + (REAL.ort.gps ? ' (Standort vom Handy).' : ' (ihr Wohnort).'));
  if (REAL.wx) x.push('Wetter dort: ' + REAL.wx.text);
  if (REAL.cal) x.push(calText());
  return x.length ? r.replace('\n\nSo redest du:', '\n' + x.join('\n') + '\n\nSo redest du:') : r; };

/* Nachrichten: Ida schreibt vor, du schickst sie selbst über WhatsApp oder SMS. */
chatSend = function(id){ var w = WINS[id], el = $(id); if (!w || !el || w.sent) return; w.sent = 1; var d = el.querySelector('.bub.draft'), a = el.querySelector('.acts'), txt = '';
  if (d) { var mb = d.querySelector('.mbody'); mb.contentEditable = 'false'; txt = mb.textContent; d.classList.remove('draft'); d.insertAdjacentHTML('beforeend', '<i class="ok">✓ fertig, jetzt nur noch abschicken</i>'); chatLog(w.o.who, 'Du: ' + txt); }
  if (a) a.hidden = true;
  var q = encodeURIComponent(txt);
  el.insertAdjacentHTML('beforeend', '<div class="acts"><a class="b pri" href="https://wa.me/?text=' + q + '" target="_blank" rel="noopener">Per WhatsApp</a><a class="b" href="sms:&body=' + q + '">Per SMS</a></div>' +
    '<div class="fine">Du wählst ' + esc(w.o.who || 'den Kontakt') + ' aus und tippst auf Senden. Ida schickt nichts allein.</div>');
  winLive(id, 'bereit'); if (id === AIMAIL) AIMAIL = null; };

if (window.IDA_APP) IDA_APP.ping.then(function(p){ if (!p) return; var o = lsGet('ida.ort'); if (o && o.lat != null) { REAL.ort = o; if (o.ort) WXD.ort = o.ort; } tick(); if (REAL.ort) wxLoad(); else ortLoad(); calLoad(); });
tick();

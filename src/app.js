/* ---------- Echte App: Ida spricht mit ElevenLabs und hört wirklich zu (wie Wispr) ---------- */
var APPV = { ai:false, voice:false, ear:false };
if (window.IDA_APP) IDA_APP.ping.then(function(p){ APPV = p || APPV;
  setTimeout(function(){ var h = $('hint'); if (!h) return;
    h.textContent = APPV.ear ? 'Tippen zum Sprechen · ' + J.name + ' hört wirklich zu' : (APPV.ai ? 'Tippen geht über das Tastatur-Symbol · ' + J.name + ' antwortet mit echter KI' : h.textContent); }, 400); });

/* Ein einziges Audio-Element, das beim ersten Tippen freigeschaltet wird (das iPhone spielt sonst keinen Ton ab). */
var AU = new Audio(); AU.preload = 'auto'; AU.setAttribute('playsinline', '');
var AU_OK = false, TTS = {}, ttsN = 0;
document.addEventListener('pointerdown', function(){ if (AU_OK) return; AU_OK = true;
  AU.src = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
  AU.play().then(function(){ AU.pause(); }, function(){}); }, true);

function shutUp(){ ttsN++; try { AU.pause(); } catch(e) {} try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch(e) {} }

var speakBrowser = speak;
speak = function(t){
  if (!APPV.voice || !voiceOn || !t) return speakBrowser(t);
  var my = ++ttsN, app = $('app'), txt = String(t).replace(/[„“]/g, '').trim();
  try { AU.pause(); if (window.speechSynthesis) speechSynthesis.cancel(); } catch(e) {}
  app.classList.add('speaking'); app.classList.remove('ear');
  var stop = function(){ if (my !== ttsN) return; app.classList.remove('speaking'); if (!LIVE && !app.classList.contains('thinking')) { app.classList.add('ear'); $('st').textContent = J.name + ' hört zu'; } };
  var got = TTS[txt] ? Promise.resolve(TTS[txt]) : fetch('/api/tts', { method:'POST', headers:IDA_APP.headers({ 'content-type':'application/json' }), body:JSON.stringify({ text:txt }) })
    .then(function(r){ if (!r.ok) throw r.status; return r.blob(); }).then(function(b){ var u = URL.createObjectURL(b); TTS[txt] = u; return u; });
  got.then(function(u){ if (my !== ttsN) return; AU.onended = stop; AU.onerror = stop; AU.src = u; return AU.play(); })
    .catch(function(){ if (my !== ttsN) return; app.classList.remove('speaking'); speakBrowser(t); });
};

/* Ohne ElevenLabs hört die Spracherkennung des Handys zu. Gibt es die nicht, geht die Tastatur auf, nie ein vorgespielter Satz. */
var SR = null;
function typeInstead(msg){ $('app').classList.remove('listening'); $('you').hidden = true; $('st').textContent = J.name; $('ctrl').hidden = true; $('typer').hidden = false; $('tin').focus(); if (msg) toast(msg); }
function listenPhone(){
  var R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) return typeInstead('Zuhören geht auf diesem Gerät noch nicht. Tipp einfach, ich lese mit.');
  if (SR) { try { SR.stop(); } catch(e) {} return; }
  shutUp(); liveStop();
  var app = $('app'), got = '', r = new R(); SR = r;
  r.lang = 'de-AT'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  app.classList.add('listening'); app.classList.remove('ear'); $('st').textContent = J.name + ' hört zu';
  $('you').hidden = false; $('you').textContent = 'Sprich einfach. Wenn du still bist, antworte ich.';
  r.onresult = function(e){ var t = ''; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; got = t.trim(); if (got) $('you').textContent = 'Du: „' + got + ' …“'; };
  r.onerror = function(e){ SR = null; app.classList.remove('listening');
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') typeInstead('Ich darf das Mikrofon nicht benutzen. Erlaube es in den Einstellungen, oder tipp einfach.');
    else if (e.error !== 'no-speech' && e.error !== 'aborted') typeInstead('Ich hab dich gerade nicht verstanden. Tipp es mir einfach.'); };
  r.onend = function(){ SR = null; app.classList.remove('listening');
    if (got) route(stripWake(got)); else { $('you').hidden = true; $('st').textContent = J.name; } };
  try { r.start(); } catch(e) { SR = null; typeInstead('Zuhören geht gerade nicht. Tipp einfach, ich lese mit.'); }
}

/* Zuhören: aufnehmen, bis du still bist, dann schreibt ElevenLabs mit und Claude räumt den Satz auf. */
var REC = null, listenDemo = listen;
listen = function(){
  if (LIVE) return listenDemo();
  if (!APPV.ear || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return listenPhone();
  if (REC) { if (REC.state === 'recording') REC.stop(); return; }
  shutUp(); liveStop();
  var app = $('app');
  navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true } }).then(function(st){
    var mt = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].filter(function(x){ return MediaRecorder.isTypeSupported(x); })[0];
    var rec = new MediaRecorder(st, mt ? { mimeType:mt } : undefined), parts = []; REC = rec;
    app.classList.add('listening'); app.classList.remove('ear'); $('st').textContent = J.name + ' hört zu';
    $('you').hidden = false; $('you').textContent = 'Sprich einfach. Wenn du still bist, antworte ich.';
    var AC = window.AudioContext || window.webkitAudioContext, ac = AC ? new AC() : null, an = null, data = null, heard = 0, quiet = 0, t0 = Date.now();
    if (ac) { an = ac.createAnalyser(); an.fftSize = 1024; ac.createMediaStreamSource(st).connect(an); data = new Uint8Array(an.fftSize); }
    var iv = setInterval(function(){
      if (an) { an.getByteTimeDomainData(data); var s = 0; for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; s += v * v; }
        if (Math.sqrt(s / data.length) > 0.035) { heard = 1; quiet = 0; } else if (heard) quiet += 100; } else heard = 1;
      var el = Date.now() - t0;
      if ((heard && quiet > 1400) || el > 45000 || (!heard && el > 9000)) { if (rec.state === 'recording') rec.stop(); }
    }, 100);
    rec.ondataavailable = function(e){ if (e.data && e.data.size) parts.push(e.data); };
    rec.onstop = function(){
      clearInterval(iv); st.getTracks().forEach(function(x){ x.stop(); }); if (ac) ac.close().catch(function(){}); REC = null; app.classList.remove('listening');
      if (!heard || !parts.length) { $('you').hidden = true; $('st').textContent = J.name; return; }
      var blob = new Blob(parts, { type:(rec.mimeType || mt || 'audio/webm').split(';')[0] });
      $('st').textContent = J.name + ' versteht dich'; $('you').textContent = 'Du: …'; app.classList.add('thinking');
      fetch('/api/stt', { method:'POST', headers:IDA_APP.headers({ 'content-type':blob.type }), body:blob })
        .then(function(r){ if (!r.ok) throw r.status; return r.json(); })
        .then(function(r){ app.classList.remove('thinking'); var t = String(r.text || '').trim();
          if (!t) { $('you').hidden = true; $('st').textContent = J.name; $('say').textContent = 'Ich hab nichts verstanden. Sag es nochmal, oder tipp es.'; return; }
          route(stripWake(t)); })
        .catch(function(){ app.classList.remove('thinking'); $('st').textContent = J.name; $('you').hidden = true;
          $('say').textContent = 'Ich hab dich gerade nicht verstanden. Magst du es nochmal sagen oder tippen?'; });
    };
    rec.start(250);
  }).catch(function(){ toast('Ohne Mikrofon kann ich nicht zuhören. Erlaube es in den Einstellungen, oder tipp einfach.'); });
};

/* Ida als Web-App: stellt dem Prototyp dieselben Werkzeuge bereit, die er als Claude-Seite hatte.
   claude.use('sample') geht jetzt an unseren Server (echte KI), claude.use('downloads') speichert direkt. */
(function(){
  var KEY = 'ida.key', key = '';
  try { key = localStorage.getItem(KEY) || ''; } catch(e) {}
  function headers(h){ h = h || {}; if (key) h['x-ida-key'] = key; return h; }
  var ping = fetch('/api/ping').then(function(r){ return r.json(); }).catch(function(){ return { ok:false }; });

  function b64(file){ return new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(String(fr.result).split(',')[1]); }; fr.onerror = rej; fr.readAsDataURL(file); }); }

  function sample(input, o){
    o = o || {};
    return Promise.all((o.images || []).map(function(f){ return b64(f).then(function(d){ return { media_type:f.type, data:d }; }); })).then(function(images){
      return fetch('/api/sample', { method:'POST', headers:headers({ 'content-type':'application/json' }), signal:o.signal,
        body:JSON.stringify({ input:input, modelTier:o.modelTier || 'default', images:images }) });
    }).then(function(r){
      if (r.status === 401) { askKey(); throw { code:'not_granted', message:'Passwort fehlt.' }; }
      if (r.status === 429) throw { code:'rate_limited', message:'Zu viele Anfragen.' };
      if (!r.ok || !r.body) throw { code:'error', message:'Server antwortet nicht.' };
      var rd = r.body.getReader(), dec = new TextDecoder(), buf = '', text = '', stop = null, err = null;
      function line(l){ if (!l.trim()) return; var m; try { m = JSON.parse(l); } catch(e) { return; }
        if (m.d) { text += m.d; if (o.onText) try { o.onText({ text:text, delta:m.d }); } catch(e) {} }
        if (m.done) stop = m.stop; if (m.error) err = m.error; }
      return (function pump(){ return rd.read().then(function(x){
        if (x.done) { line(buf); if (err) throw { code:err.code, message:err.message, text:text }; return { text:text, truncated:stop === 'max_tokens' }; }
        buf += dec.decode(x.value, { stream:true }); var parts = buf.split('\n'); buf = parts.pop(); parts.forEach(line); return pump(); }); })();
    }).catch(function(e){
      if (e && e.name === 'AbortError') throw { code:'cancelled', message:'abgebrochen' };
      throw (e && e.code) ? e : { code:'error', message:String(e && e.message || e) };
    });
  }
  sample.json = function(input, o){
    var q = typeof input === 'string' ? input + '\n\nAntworte nur mit gültigem JSON, ohne Erklärung und ohne Codeblock.' : input;
    return sample(q, o).then(function(r){ var t = r.text, i = t.search(/[\[{]/), j = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
      try { return JSON.parse(t.slice(i, j + 1)); } catch(e) { throw { code:'bad_json', message:'Keine gültige Antwort.', text:t }; } });
  };
  sample.limits = function(){ return Promise.resolve({ images:true }); };

  var downloads = { save:function(f){ return new Promise(function(res){ var b = f.data instanceof Blob ? f.data : new Blob([f.data]);
    var u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = f.filename || 'ida'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(u); }, 4000); res(); }); } };

  window.claude = { use:function(name){
    if (name === 'downloads') return Promise.resolve(downloads);
    if (name === 'sample') return ping.then(function(p){ return p.ai ? sample : null; });
    return Promise.resolve(null);
  } };
  window.IDA_APP = { headers:headers, ping:ping };

  /* Passwort einmal eingeben, dann merkt sich das iPhone es. */
  function askKey(){
    if (document.getElementById('ida-key')) return;
    var d = document.createElement('form'); d.id = 'ida-key';
    d.innerHTML = '<div><b>Ida ist privat</b><span>Gib das Passwort ein, das ihr auf Render festgelegt habt.</span>' +
      '<input id="ida-key-in" type="password" autocomplete="current-password" placeholder="Passwort" aria-label="Passwort">' +
      '<em id="ida-key-err" hidden>Das Passwort stimmt nicht.</em><button type="submit">Weiter</button></div>';
    document.body.appendChild(d); setTimeout(function(){ var i = document.getElementById('ida-key-in'); if (i) i.focus(); }, 50);
    d.addEventListener('submit', function(e){ e.preventDefault(); var v = document.getElementById('ida-key-in').value;
      fetch('/api/check', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ key:v }) }).then(function(r){ return r.json(); }).then(function(r){
        if (!r.ok) { document.getElementById('ida-key-err').hidden = false; return; }
        key = v; try { localStorage.setItem(KEY, v); } catch(e) {} d.remove(); }); });
  }
  ping.then(function(p){ if (!p.password) return; fetch('/api/check', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ key:key }) })
    .then(function(r){ return r.json(); }).then(function(r){ if (!r.ok) { if (document.body) askKey(); else document.addEventListener('DOMContentLoaded', askKey); } }); });
})();

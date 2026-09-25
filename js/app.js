// ביתן ספרק - דיווחי שטח | core: session, API, routing, rep screens.
(function () {
  const TZ = 'Asia/Jerusalem';
  const LS_SESSION = 'bs_session';
  const LS_CACHE = 'bs_rep_cache';
  const MAX_PHOTOS = 6;
  const DEMO = !window.CONFIG.API_URL;

  /* ------------------------------------------------------------ utils */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode / full */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  const dayStr = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
  const todayStr = () => dayStr(new Date());
  function when(iso) {
    const d = new Date(iso);
    const time = d.toLocaleTimeString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    const diff = (new Date(todayStr()) - new Date(dayStr(d))) / 86400e3;
    if (diff === 0) return `היום, ${time}`;
    if (diff === 1) return `אתמול, ${time}`;
    return `${d.toLocaleDateString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric' })}, ${time}`;
  }
  const longToday = () => new Date().toLocaleDateString('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });

  let toastTimer;
  function toast(msg, isError) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, isError ? 4200 : 2600);
  }

  function busy(btn, on, label) {
    if (on) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>${esc(label || '')}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.label || btn.innerHTML;
    }
  }

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  /* ------------------------------------------------------------ API */

  async function api(action, payload = {}) {
    const body = Object.assign({ action, code: session && session.code }, payload);
    if (DEMO) return MockApi.call(action, body);
    let res;
    const ctrl = window.AbortController ? new AbortController() : null;
    const timer = ctrl && setTimeout(() => ctrl.abort(), action === 'submitReport' ? 120000 : 45000);
    try {
      res = await fetch(window.CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // "simple" request: no CORS preflight
        body: JSON.stringify(body),
        redirect: 'follow',
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? 'השרת לא הגיב בזמן. נסה שוב.' : 'אין חיבור לאינטרנט. נסה שוב.');
    } finally {
      clearTimeout(timer);
    }
    let data;
    try { data = await res.json(); } catch (e) { throw new Error('תקלה בתקשורת עם השרת. נסה שוב.'); }
    if (!data.ok) {
      const err = new Error(data.error || 'שגיאה');
      err.auth = /קוד כניסה שגוי/.test(data.error || '');
      throw err;
    }
    return data;
  }

  /* ------------------------------------------------------------ session & shell */

  let session = store.get(LS_SESSION); // { code, role }
  let repData = store.get(LS_CACHE); // login payload for reps

  function logout() {
    session = null;
    repData = null;
    draft = null;
    if (window.Admin) window.Admin.reset();
    store.del(LS_SESSION);
    store.del(LS_CACHE);
    history.replaceState(null, '', location.pathname);
    renderLogin();
  }

  function shell(inner, opts = {}) {
    const demo = DEMO ? `<div class="demo-banner">מצב הדגמה · הנתונים נשמרים בדפדפן זה בלבד</div>` : '';
    return `<div class="shell">
      <header class="topbar"><div class="container ${opts.wide ? 'wide' : ''} topbar-inner">
        <img class="topbar-logo" src="assets/logo.svg" alt="ביתן ספרק">
        <div class="topbar-user"><span class="name">${esc(opts.user || '')}</span>
          <button class="link-btn" data-act="logout">יציאה</button></div>
      </div></header>${demo}
      <main><div class="container ${opts.wide ? 'wide' : ''}">${inner}</div></main></div>`;
  }

  function mount(html) {
    const app = $('#app');
    app.innerHTML = html;
    const out = $('[data-act="logout"]', app);
    if (out) out.onclick = () => { if (confirm('לצאת מהמערכת?')) logout(); };
    window.scrollTo(0, 0);
    return app;
  }

  /* ------------------------------------------------------------ login */

  function renderLogin(errorMsg) {
    const demo = DEMO ? `<div class="login-foot">מצב הדגמה · נציג: ${MockApi.codes.reps.join(' / ')} · מנהל: ${MockApi.codes.admin}</div>` : '';
    const app = mount(`<div class="login"><div class="login-box">
      <img class="login-logo" src="assets/logo.svg" alt="ביתן ספרק - יבוא חלפי רכב">
      <form class="card" novalidate>
        <h1>כניסה למערכת</h1>
        <p>הזן את קוד הכניסה האישי שלך</p>
        <label class="field"><span class="visually-hidden" hidden>קוד כניסה</span>
          <input class="code-input" name="code" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="10" required aria-label="קוד כניסה"></label>
        <div class="form-error">${esc(errorMsg || '')}</div>
        <button class="btn block lg" type="submit">כניסה</button>
      </form>${demo}
    </div></div>`);
    const form = $('form', app);
    const input = form.code;
    setTimeout(() => input.focus(), 50);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const code = input.value.replace(/\D/g, '');
      if (!code) { $('.form-error', form).textContent = 'יש להזין קוד'; return; }
      const btn = $('button', form);
      busy(btn, true, 'מתחבר…');
      try {
        session = { code, role: null };
        const res = await api('login', Object.assign({ code }, window.Admin.defaultRange()));
        session.role = res.role;
        store.set(LS_SESSION, session);
        if (res.role === 'rep') { repData = res; store.set(LS_CACHE, res); } else if (res.reps) window.Admin.prime(res);
        const target = res.role === 'admin' ? '#admin/reports' : '#home';
        if (location.hash === target) route(); else location.hash = target; // hashchange renders once
      } catch (err) {
        session = null;
        busy(btn, false);
        $('.form-error', form).textContent = err.message;
        input.select();
      }
    };
  }

  /* ------------------------------------------------------------ rep: home */

  function reportCard(r, opts = {}) {
    const photos = (r.photos || []).filter(p => p.thumb).map(p =>
      `<a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`).join('');
    const n = (r.photos || []).length;
    const photoNote = n && !photos ? `<div class="small muted" style="margin-top:8px">${n === 1 ? 'תמונה אחת מצורפת' : `${n} תמונות מצורפות`}</div>` : '';
    return `<article class="report">
      <div class="report-head"><h3>${esc(r.customerName)}</h3><span class="report-meta">${esc(when(r.createdAt))}</span></div>
      ${opts.showRep ? `<div class="small" style="margin:-2px 0 6px;color:var(--ink-2)">${esc(r.repName)}</div>` : ''}
      <span class="tag">${esc(r.topic)}</span>
      ${r.text ? `<p class="report-text ${opts.clamp ? 'clamp' : ''}">${esc(r.text)}</p>` : ''}
      ${photos ? `<div class="report-photos">${photos}</div>` : photoNote}
    </article>`;
  }

  function renderHome() {
    const d = repData;
    const today = (d.reports || []).filter(r => dayStr(r.createdAt) === todayStr()).length;
    const status = today
      ? `<div class="status done"><span>נשלחו היום <b>${today}</b> ${today === 1 ? 'דיווח' : 'דיווחים'}</span></div>`
      : `<div class="status"><span>טרם נשלח דיווח היום</span></div>`;
    const list = (d.reports || []).length
      ? `<div class="report-list">${d.reports.slice(0, 20).map(r => reportCard(r, { clamp: true })).join('')}</div>`
      : `<div class="empty">עדיין לא נשלחו דיווחים</div>`;
    const app = mount(shell(`
      <div class="page-head"><p class="eyebrow">${esc(longToday())}</p><h1>שלום, ${esc(d.rep.name)}</h1></div>
      ${status}
      <a class="btn block lg" href="#new">דיווח חדש</a>
      <div class="section-title"><h2>הדיווחים האחרונים שלי</h2><button class="link-btn" data-act="refresh">רענון</button></div>
      ${list}`, { user: d.rep.name }));
    $('[data-act="refresh"]', app).onclick = async (e) => {
      busy(e.target, true);
      await refreshRep(true);
      if (location.hash === '#home' || !location.hash) renderHome();
    };
  }

  async function refreshRep(showErrors) {
    try {
      const res = await api('login', { code: session.code });
      if (res.role !== 'rep') return logout();
      repData = res;
      store.set(LS_CACHE, res);
      return true;
    } catch (err) {
      if (err.auth) { logout(); toast('הקוד אינו פעיל עוד. יש להתחבר מחדש.', true); return false; }
      if (showErrors) toast(err.message, true);
      return false;
    }
  }

  /* ------------------------------------------------------------ rep: new report */

  let draft = null;
  const newDraft = () => ({ clientId: uid(), customerId: '', topicId: '', text: '', photos: [] });

  function renderNew() {
    if (!draft) draft = newDraft();
    const d = repData;
    const app = mount(shell(`
      <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px">
        <div><p class="eyebrow">${esc(longToday())}</p><h1>דיווח חדש</h1></div>
        <a class="link-btn" href="#home">חזרה</a>
      </div>
      <div class="card">
        <section class="step">
          <div class="step-label"><span class="step-num">01</span><h3>לקוח</h3></div>
          <div id="customer-step"></div>
        </section>
        <section class="step">
          <div class="step-label"><span class="step-num">02</span><h3>נושא הדיווח</h3></div>
          <div class="chips" role="group" aria-label="נושא הדיווח">
            ${d.topics.map(t => `<button type="button" class="chip" data-topic="${esc(t.id)}" aria-pressed="${t.id === draft.topicId}">${esc(t.name)}</button>`).join('')}
          </div>
        </section>
        <section class="step">
          <div class="step-label"><span class="step-num">03</span><h3>פירוט</h3></div>
          <textarea class="input" id="text" placeholder="מה עלה בביקור? אפשר להקליד או להקליט" aria-label="פירוט">${esc(draft.text)}</textarea>
          <div class="dictate" id="dictate"></div>
        </section>
        <section class="step">
          <div class="step-label"><span class="step-num">04</span><h3>תמונות</h3><span class="opt">לא חובה · עד ${MAX_PHOTOS}</span></div>
          <div class="photo-grid" id="photos"></div>
          <input type="file" id="file" class="file-hidden" accept="image/*" multiple>
          <button type="button" class="btn secondary block" id="add-photo">הוספת תמונה</button>
        </section>
      </div>
      <div class="submit-bar"><button class="btn block lg" id="submit">שליחת הדיווח</button></div>`, { user: d.rep.name }));

    renderCustomerStep();
    $$('.chip[data-topic]', app).forEach(ch => ch.onclick = () => {
      draft.topicId = ch.dataset.topic;
      $$('.chip[data-topic]', app).forEach(c => c.setAttribute('aria-pressed', c === ch));
    });
    const ta = $('#text', app);
    ta.oninput = () => { draft.text = ta.value; };
    Dictation.mount($('#dictate', app), ta, (v) => { draft.text = v; });
    renderPhotos();
    $('#add-photo', app).onclick = () => $('#file', app).click();
    $('#file', app).onchange = onFiles;
    $('#submit', app).onclick = submit;
  }

  function renderCustomerStep() {
    const box = $('#customer-step');
    const list = repData.customers;
    const sel = list.find(c => c.id === draft.customerId);
    if (sel) {
      box.innerHTML = `<div class="picker-selected"><div><div class="t">${esc(sel.name)}</div>
        ${sel.city ? `<div class="s">${esc(sel.city)}</div>` : ''}</div><button type="button" class="link-btn">החלפה</button></div>`;
      $('button', box).onclick = () => { draft.customerId = ''; renderCustomerStep(); $('#cust-q').focus(); };
      return;
    }
    if (!list.length) {
      box.innerHTML = `<div class="empty">לא משויכים אליך לקוחות. יש לפנות למנהל המכירות.</div>`;
      return;
    }
    box.innerHTML = `<input class="input" id="cust-q" type="search" placeholder="חיפוש לפי שם או עיר" autocomplete="off" aria-label="חיפוש לקוח">
      <div class="picker-list" id="cust-list"></div>`;
    const q = $('#cust-q', box);
    const draw = () => {
      const term = q.value.trim();
      const hits = list.filter(c => !term || c.name.includes(term) || (c.city || '').includes(term));
      $('#cust-list', box).innerHTML = hits.length
        ? hits.map(c => `<button type="button" class="row-btn" data-id="${esc(c.id)}"><span>${esc(c.name)}</span><span class="s">${esc(c.city || '')}</span></button>`).join('')
        : `<div class="picker-empty">לא נמצאו לקוחות</div>`;
      $$('.row-btn', box).forEach(b => b.onclick = () => { draft.customerId = b.dataset.id; renderCustomerStep(); });
    };
    q.oninput = draw;
    draw();
  }

  function renderPhotos() {
    const grid = $('#photos');
    grid.innerHTML = draft.photos.map((p, i) =>
      `<div class="photo"><img src="${p.dataUrl}" alt="תמונה ${i + 1}"><button type="button" data-i="${i}">הסרה</button></div>`).join('');
    $$('button', grid).forEach(b => b.onclick = () => { draft.photos.splice(Number(b.dataset.i), 1); renderPhotos(); });
    const add = $('#add-photo');
    add.hidden = draft.photos.length >= MAX_PHOTOS;
    add.textContent = draft.photos.length ? 'הוספת תמונה נוספת' : 'הוספת תמונה';
  }

  async function onFiles(e) {
    const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS - draft.photos.length);
    e.target.value = '';
    const add = $('#add-photo');
    busy(add, true, 'מעבד תמונות…');
    for (const f of files) {
      try { draft.photos.push(await compressImage(f)); } catch (err) { toast('לא ניתן לקרוא את התמונה', true); }
    }
    busy(add, false);
    renderPhotos();
  }

  function compressImage(file, max = 1600, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const dataUrl = c.toDataURL('image/jpeg', quality);
        resolve({ dataUrl, data: dataUrl.split(',')[1], mime: 'image/jpeg' });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  async function submit(e) {
    const btn = e.currentTarget;
    Dictation.stop();
    draft.text = $('#text').value;
    if (!draft.customerId) return toast('יש לבחור לקוח', true);
    if (!draft.topicId) return toast('יש לבחור נושא', true);
    if (!draft.text.trim() && !draft.photos.length) return toast('יש להוסיף פירוט או תמונה', true);
    busy(btn, true, 'שולח…');
    try {
      await api('submitReport', {
        report: {
          clientId: draft.clientId, customerId: draft.customerId, topicId: draft.topicId, text: draft.text.trim(),
          photos: draft.photos.map(p => ({ data: p.data, mime: p.mime })),
        },
      });
      draft = null;
      toast('הדיווח נשלח בהצלחה');
      await refreshRep(false);
      location.hash = '#home';
    } catch (err) {
      busy(btn, false);
      toast(err.message, true);
    }
  }

  /* ------------------------------------------------------------ dictation (free, in-browser speech-to-text) */

  const Dictation = (() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    // Android Chrome duplicates text in continuous mode, so there we run phrase-by-phrase and restart.
    // iOS Safari ends a non-continuous session instantly; an immediate restart there spins and freezes the page.
    const ANDROID = /Android/i.test(navigator.userAgent);
    const MAX_RESTARTS = 40;
    let rec = null, listening = false, base = '', sessionFinal = '', ta = null, onChange = null, stopTimer = null;
    let restarts = 0, startedAt = 0, restartTimer = null;

    const join = (a, b) => (a && b ? a.replace(/\s+$/, '') + ' ' + b.trim() : (a || '') + (b || '').trim());

    function ui() {
      const btn = $('#rec-btn');
      if (!btn) return;
      btn.classList.toggle('on', listening);
      btn.innerHTML = `<span class="rec-dot"></span>${listening ? 'עצירת הקלטה' : 'הקלטה קולית'}`;
      $('#rec-status').textContent = listening ? 'מקשיב… דבר בחופשיות, הטקסט יופיע בשדה' : '';
      if (ta) { ta.classList.toggle('listening', listening); ta.readOnly = listening; }
    }

    function startSession() {
      rec = new SR();
      rec.lang = 'he-IL';
      rec.interimResults = true;
      rec.continuous = !ANDROID;
      startedAt = Date.now();
      rec.onresult = (e) => {
        if (!listening) return;
        let fin = '', interim = '';
        for (let i = 0; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) fin += t; else interim += t;
        }
        sessionFinal = fin;
        ta.value = join(base, fin + interim);
        onChange(ta.value);
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          listening = false;
          toast('אין הרשאה למיקרופון. יש לאשר גישה בהגדרות.', true);
        } else if (e.error === 'network') {
          listening = false;
          toast('ההקלטה דורשת חיבור לאינטרנט', true);
        } else if (e.error === 'audio-capture') {
          listening = false;
          toast('המיקרופון לא זמין כרגע', true);
        }
      };
      rec.onend = () => {
        base = join(base, sessionFinal);
        sessionFinal = '';
        ta.value = base;
        onChange(base);
        // Restart only while still recording, never in a tight loop: sessions that die instantly stop the recording.
        const quick = Date.now() - startedAt < 1500;
        if (listening && restarts < MAX_RESTARTS && !(quick && restarts > 2)) {
          restarts += 1;
          restartTimer = setTimeout(() => {
            if (!listening) return;
            try { startSession(); } catch (err) { listening = false; ui(); }
          }, quick ? 600 : 150);
        } else {
          listening = false;
          ui();
        }
      };
      rec.start();
    }

    function start() {
      base = ta.value;
      listening = true;
      restarts = 0;
      ui();
      try { startSession(); } catch (err) { listening = false; ui(); toast('לא ניתן להפעיל הקלטה', true); }
      clearTimeout(stopTimer);
      stopTimer = setTimeout(stop, 5 * 60 * 1000);
    }

    function stop() {
      if (!listening) return;
      listening = false;
      clearTimeout(stopTimer);
      clearTimeout(restartTimer);
      try { rec && rec.stop(); } catch (e) { /* already stopped */ }
      // Some browsers never fire onend after stop(); force-release so the page never stays locked.
      const old = rec;
      setTimeout(() => { if (!(listening && old === rec)) { try { old && old.abort(); } catch (e) { /* ignore */ } } }, 1200);
      ui();
    }

    function mount(box, textarea, changed) {
      ta = textarea;
      onChange = changed;
      listening = false;
      if (!SR) {
        box.innerHTML = `<span class="rec-status">להכתבה קולית: לחץ על סמל המיקרופון במקלדת הטלפון</span>`;
        return;
      }
      box.innerHTML = `<button type="button" class="btn secondary sm rec-btn" id="rec-btn"></button><span class="rec-status" id="rec-status"></span>`;
      $('#rec-btn', box).onclick = () => (listening ? stop() : start());
      ui();
    }

    return { mount, stop };
  })();

  /* ------------------------------------------------------------ routing */

  function route() {
    Dictation.stop();
    if (!session || !session.role) return renderLogin();
    const h = location.hash || '';
    if (session.role === 'admin') {
      const tab = h.startsWith('#admin/') ? h.slice(7) : 'reports';
      return window.Admin.render(tab);
    }
    if (!repData) return renderLogin();
    if (h === '#new') return renderNew();
    return renderHome();
  }

  window.addEventListener('hashchange', route);

  async function boot() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    if (session && session.role === 'rep') {
      if (repData) route(); else mount(`<div class="center-load"><span class="spinner"></span></div>`);
      const ok = await refreshRep(false);
      if (ok && location.hash !== '#new') route();
      else if (!repData && session) renderLogin();
      return;
    }
    route();
  }

  window.App = { api, esc, $, $$, toast, busy, mount, shell, logout, reportCard, route, get session() { return session; }, setSession(s) { session = s; store.set(LS_SESSION, s); }, todayStr, dayStr, TZ };
  document.addEventListener('DOMContentLoaded', boot);
})();

// ביתן ספרק - דיווחי שטח | admin panel (reports, reps, customers, topics, settings).
(function () {
  const { api, esc, $, $$, toast, busy, mount, shell, reportCard } = window.App;
  const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  const TABS = [['reports', 'דיווחים'], ['reps', 'נציגים'], ['customers', 'לקוחות'], ['topics', 'נושאים'], ['settings', 'הגדרות']];

  let data = null; // adminData payload
  let reportsFilter = null;
  let lastReports = [];
  let primed = false; // lastReports already match reportsFilter (came with the bundle)
  let customerFilter = { q: '', repId: '' };

  const dateOffset = (days) => App.dayStr(new Date(Date.now() + days * 86400e3));
  const repName = (id) => (data.reps.find(r => r.id === id) || {}).name || '—';
  const statusPill = (active) => `<span class="pill ${active ? '' : 'off'}">${active ? 'פעיל' : 'לא פעיל'}</span>`;

  let loading = null; // in-flight adminData request, shared so double renders don't refetch

  const defaultRange = () => ({ from: dateOffset(-6), to: dateOffset(0) });

  const LS_ADMIN = 'bs_admin_cache';
  const saveCache = (res) => { try { localStorage.setItem(LS_ADMIN, JSON.stringify(res)); } catch (e) { /* full or blocked */ } };
  const readCache = () => { try { return JSON.parse(localStorage.getItem(LS_ADMIN)); } catch (e) { return null; } };

  /** Take a bundle (login or adminData response): panel data + reports for its range. */
  function prime(res) {
    data = res;
    reportsFilter = { from: res.range ? res.range.from : dateOffset(-6), to: res.range ? res.range.to : dateOffset(0), repId: '' };
    lastReports = res.reports || [];
    primed = true;
    saveCache(res);
  }

  /** Show last session's data instantly, then refresh from the server and redraw if nothing is being edited. */
  async function refreshInBackground() {
    try {
      const res = await api('adminData', defaultRange());
      const busyEditing = $('#modal-root').children.length || document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      prime(res);
      if (!busyEditing && location.hash.startsWith('#admin/')) render(location.hash.slice(7));
    } catch (err) {
      if (err.auth) { App.logout(); toast('הקוד אינו תקף. יש להתחבר מחדש.', true); }
    }
  }

  async function loadData() {
    try {
      prime(await api('adminData', reportsFilter || defaultRange()));
      return true;
    } catch (err) {
      if (err.auth) { App.logout(); toast('הקוד אינו תקף. יש להתחבר מחדש.', true); return false; }
      showLoadError(err.message);
      return false;
    }
  }

  function showLoadError(msg) {
    const app = mount(shell(`<div class="empty" style="margin-top:24px">
        <p style="margin:0 0 16px;color:var(--ink-2)">${esc(msg)}</p>
        <button class="btn" id="retry">נסה שוב</button></div>`, { user: 'מנהל', wide: true }));
    $('#retry', app).onclick = () => render(location.hash.slice(7) || 'reports');
  }

  async function render(tab) {
    if (!TABS.some(([k]) => k === tab)) tab = 'reports';
    if (!data) {
      const cached = readCache();
      if (cached && cached.reps) {
        prime(cached);
        refreshInBackground();
      }
    }
    if (!data) {
      mount(`<div class="center-load" style="flex-direction:column;align-items:center;gap:14px">
        <span class="spinner"></span><span class="muted small">טוען נתונים…</span></div>`);
      loading = loading || loadData().finally(() => { loading = null; });
      if (!(await loading) || !data) return;
      if (('#admin/' + tab) !== location.hash && location.hash.startsWith('#admin/')) return; // a newer render took over
    }
    const app = mount(shell(`
      <div class="page-head"><p class="eyebrow">ממשק ניהול</p><h1>${esc(data.appName)}</h1></div>
      <nav class="tabs" role="tablist">${TABS.map(([k, label]) =>
        `<button class="tab" role="tab" aria-selected="${k === tab}" data-tab="${k}">${label}</button>`).join('')}</nav>
      <div id="tab-body"></div>`, { user: 'מנהל', wide: true }));
    $$('.tab', app).forEach(t => t.onclick = () => { location.hash = '#admin/' + t.dataset.tab; });
    ({ reports: tabReports, reps: tabReps, customers: tabCustomers, topics: tabTopics, settings: tabSettings })[tab]($('#tab-body', app));
  }

  /* ------------------------------------------------------------ reports */

  function tabReports(box) {
    reportsFilter = reportsFilter || { from: dateOffset(-6), to: dateOffset(0), repId: '' };
    box.innerHTML = `
      <div class="toolbar">
        <label class="field"><span>מתאריך</span><input type="date" id="f-from" value="${reportsFilter.from}"></label>
        <label class="field"><span>עד תאריך</span><input type="date" id="f-to" value="${reportsFilter.to}"></label>
        <label class="field"><span>נציג</span><select id="f-rep"><option value="">כל הנציגים</option>
          ${data.reps.map(r => `<option value="${esc(r.id)}" ${r.id === reportsFilter.repId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
        <button class="btn dark" id="f-go">הצגה</button>
        <button class="btn secondary" id="f-csv">ייצוא לאקסל</button>
      </div>
      <div id="rep-results"><div class="center-load"><span class="spinner"></span></div></div>`;
    const go = async () => {
      reportsFilter = { from: $('#f-from').value, to: $('#f-to').value, repId: $('#f-rep').value };
      $('#rep-results').innerHTML = `<div class="center-load"><span class="spinner"></span></div>`;
      try {
        lastReports = (await api('adminReports', reportsFilter)).reports;
        drawReports();
      } catch (err) { toast(err.message, true); $('#rep-results').innerHTML = ''; }
    };
    $('#f-go').onclick = go;
    $('#f-csv').onclick = exportCsv;
    if (primed) { primed = false; drawReports(); } else go();
  }

  function drawReports() {
    const r = lastReports;
    const activeReps = data.reps.filter(x => x.active).length;
    const stats = `<div class="stats">
      <div class="stat"><div class="k">דיווחים</div><div class="v">${r.length}</div></div>
      <div class="stat"><div class="k">נציגים שדיווחו</div><div class="v">${new Set(r.map(x => x.repId)).size} / ${activeReps}</div></div>
      <div class="stat"><div class="k">לקוחות שטופלו</div><div class="v">${new Set(r.map(x => x.customerName)).size}</div></div>
      <div class="stat"><div class="k">עם תמונות</div><div class="v">${r.filter(x => (x.photos || []).length).length}</div></div></div>`;
    $('#rep-results').innerHTML = stats + (r.length
      ? `<div class="reports-admin">${r.map(x => reportCard(x, { showRep: true })).join('')}</div>`
      : `<div class="empty">אין דיווחים בטווח שנבחר</div>`);
  }

  function exportCsv() {
    if (!lastReports.length) return toast('אין נתונים לייצוא', true);
    const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = [['תאריך', 'שעה', 'נציג', 'לקוח', 'נושא', 'פירוט', 'תמונות']].concat(lastReports.map(x => {
      const d = new Date(x.createdAt);
      return [d.toLocaleDateString('he-IL', { timeZone: App.TZ }), d.toLocaleTimeString('he-IL', { timeZone: App.TZ, hour: '2-digit', minute: '2-digit' }),
        x.repName, x.customerName, x.topic, x.text, (x.photos || []).map(p => p.url).join(' ')];
    }));
    const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `דיווחים_${reportsFilter.from}_${reportsFilter.to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ------------------------------------------------------------ generic table + form */

  function table(cols, rows, onRow) {
    if (!rows.length) return `<div class="empty">אין נתונים להצגה</div>`;
    return `<div class="table-wrap"><table class="table"><thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr data-i="${i}" class="${r.active === false ? 'inactive' : ''}">${cols.map((c, j) => {
        const v = c.render ? c.render(r) : esc(r[c.key]);
        return `<td class="${j === 0 ? 'primary' : ''} ${c.cls || ''} ${v === '' ? 'blank' : ''}" ${j ? `data-label="${c.label}"` : ''}>${v}</td>`;
      }).join('')}</tr>`).join('')}
      </tbody></table></div>`;
  }

  function bindRows(box, rows, onRow) {
    $$('tbody tr', box).forEach(tr => tr.onclick = () => onRow(rows[Number(tr.dataset.i)]));
  }

  function field(f, v) {
    const val = v == null ? '' : v;
    if (f.type === 'checkbox') return `<label class="check"><input type="checkbox" name="${f.key}" ${val !== false ? 'checked' : ''}>${f.label}</label>`;
    let control;
    if (f.type === 'select') {
      control = `<select name="${f.key}">${f.placeholder ? `<option value="">${f.placeholder}</option>` : ''}
        ${f.options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      control = `<textarea name="${f.key}" rows="${f.rows || 6}" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`;
    } else {
      control = `<input name="${f.key}" type="${f.type || 'text'}" value="${esc(val)}" ${f.inputmode ? `inputmode="${f.inputmode}"` : ''} ${f.dir ? `dir="${f.dir}"` : ''} autocomplete="off">`;
    }
    return `<label class="field"><span>${f.label}</span>${control}${f.extra || ''}${f.hint ? `<small class="hint">${f.hint}</small>` : ''}</label>`;
  }

  function openForm({ title, fields, values = {}, submitLabel = 'שמירה', onSubmit, onOpen }) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-backdrop"><form class="modal" novalidate>
      <div class="modal-head"><h2>${title}</h2><button type="button" class="link-btn" data-close>סגירה</button></div>
      ${fields.map(f => field(f, values[f.key])).join('')}
      <div class="form-error"></div>
      <div class="modal-actions"><button class="btn" type="submit">${submitLabel}</button><button class="btn secondary" type="button" data-close>ביטול</button></div>
    </form></div>`;
    const form = $('form', root);
    const close = () => { root.innerHTML = ''; };
    $$('[data-close]', root).forEach(b => b.onclick = close);
    $('.modal-backdrop', root).onclick = (e) => { if (e.target.classList.contains('modal-backdrop')) close(); };
    if (onOpen) onOpen(form);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const out = {};
      fields.forEach(f => { out[f.key] = f.type === 'checkbox' ? form[f.key].checked : form[f.key].value.trim(); });
      const btn = $('button[type="submit"]', form);
      busy(btn, true, 'שומר…');
      try {
        await onSubmit(out);
        close();
      } catch (err) {
        busy(btn, false);
        $('.form-error', form).textContent = err.message;
      }
    };
    const first = $('input:not([type=checkbox]), textarea', form);
    if (first && !values.id) setTimeout(() => first.focus(), 60);
  }

  async function saveRecord(tableName, record, okMsg) {
    await api('adminSave', { table: tableName, record });
    await loadData();
    toast(okMsg);
    render(location.hash.slice(7) || 'reports');
  }

  /* ------------------------------------------------------------ reps */

  function tabReps(box) {
    const counts = {};
    data.customers.filter(c => c.active).forEach(c => { counts[c.repId] = (counts[c.repId] || 0) + 1; });
    const rows = data.reps.slice().sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, 'he'));
    box.innerHTML = `<div class="toolbar"><div class="grow muted small">לחיצה על שורה פותחת עריכה. נציג שעזב – יש לסמן כלא פעיל, והקוד שלו יפסיק לעבוד מיד.</div>
      <button class="btn" id="add">נציג חדש</button></div>` +
      table([
        { label: 'שם', key: 'name' },
        { label: 'טלפון', key: 'phone', cls: 'num' },
        { label: 'מייל', key: 'email' },
        { label: 'קוד כניסה', key: 'code', cls: 'num' },
        { label: 'לקוחות', render: r => String(counts[r.id] || 0) },
        { label: 'סטטוס', render: r => statusPill(r.active) },
      ], rows);
    bindRows(box, rows, repForm);
    $('#add', box).onclick = () => repForm({ active: true, code: randomCode() });
  }

  const randomCode = () => String(100000 + Math.floor(Math.random() * 900000));

  function repForm(rec) {
    openForm({
      title: rec.id ? 'עריכת נציג' : 'נציג חדש',
      values: rec,
      fields: [
        { key: 'name', label: 'שם מלא' },
        { key: 'phone', label: 'טלפון', type: 'tel', dir: 'ltr' },
        { key: 'email', label: 'מייל', type: 'email', dir: 'ltr', hint: 'לכתובת זו יישלחו התזכורות היומיות' },
        { key: 'code', label: 'קוד כניסה', inputmode: 'numeric', dir: 'ltr', hint: '4 עד 8 ספרות. הנציג מזין אותו פעם אחת באפליקציה.',
          extra: '<button type="button" class="link-btn accent" data-gen style="margin-top:6px">יצירת קוד חדש</button>' },
        { key: 'active', label: 'נציג פעיל', type: 'checkbox' },
      ],
      onOpen: (form) => { $('[data-gen]', form).onclick = () => { form.code.value = randomCode(); }; },
      onSubmit: (v) => saveRecord('reps', Object.assign({ id: rec.id }, v), 'הנציג נשמר'),
    });
  }

  /* ------------------------------------------------------------ customers */

  function tabCustomers(box) {
    box.innerHTML = `<div class="toolbar">
        <label class="field grow"><span>חיפוש</span><input id="c-q" type="search" placeholder="שם לקוח, עיר או איש קשר" value="${esc(customerFilter.q)}"></label>
        <label class="field"><span>נציג</span><select id="c-rep"><option value="">כל הנציגים</option>
          ${data.reps.map(r => `<option value="${esc(r.id)}" ${r.id === customerFilter.repId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
        <button class="btn secondary" id="import">ייבוא מאקסל</button>
        <button class="btn" id="add">לקוח חדש</button>
      </div><div id="c-list"></div>`;
    const draw = () => {
      customerFilter = { q: $('#c-q').value.trim(), repId: $('#c-rep').value };
      const q = customerFilter.q;
      const rows = data.customers
        .filter(c => (!customerFilter.repId || c.repId === customerFilter.repId) &&
          (!q || [c.name, c.city, c.contact].some(v => (v || '').includes(q))))
        .sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, 'he'));
      const shown = rows.slice(0, 300);
      $('#c-list').innerHTML = `<p class="small muted" style="margin:0 0 10px">${rows.length} לקוחות${rows.length > shown.length ? ` · מוצגים ${shown.length} הראשונים, יש לצמצם בחיפוש` : ''}</p>` +
        table([
          { label: 'שם לקוח', key: 'name' },
          { label: 'עיר', key: 'city' },
          { label: 'איש קשר', key: 'contact' },
          { label: 'טלפון', key: 'phone', cls: 'num' },
          { label: 'נציג', render: r => esc(repName(r.repId)) },
          { label: 'סטטוס', render: r => statusPill(r.active) },
        ], shown);
      bindRows($('#c-list'), shown, customerForm);
    };
    $('#c-q').oninput = draw;
    $('#c-rep').onchange = draw;
    $('#add', box).onclick = () => customerForm({ active: true, repId: customerFilter.repId });
    $('#import', box).onclick = importForm;
    draw();
  }

  function customerForm(rec) {
    openForm({
      title: rec.id ? 'עריכת לקוח' : 'לקוח חדש',
      values: rec,
      fields: [
        { key: 'name', label: 'שם לקוח' },
        { key: 'city', label: 'עיר' },
        { key: 'contact', label: 'איש קשר' },
        { key: 'phone', label: 'טלפון', type: 'tel', dir: 'ltr' },
        { key: 'repId', label: 'נציג אחראי', type: 'select', placeholder: 'בחירת נציג', options: data.reps.filter(r => r.active || r.id === rec.repId).map(r => [r.id, r.name]) },
        { key: 'active', label: 'לקוח פעיל', type: 'checkbox' },
      ],
      onSubmit: (v) => saveRecord('customers', Object.assign({ id: rec.id }, v), 'הלקוח נשמר'),
    });
  }

  function importForm() {
    openForm({
      title: 'ייבוא לקוחות מאקסל',
      submitLabel: 'ייבוא',
      fields: [{
        key: 'paste', label: 'העתק מאקסל והדבק כאן', type: 'textarea', rows: 9,
        placeholder: 'שם לקוח	עיר	איש קשר	טלפון	שם נציג',
        hint: 'סדר העמודות: שם לקוח, עיר, איש קשר, טלפון, שם נציג. שם הנציג חייב להיות זהה לשם שמופיע בלשונית "נציגים". שורת כותרות, אם קיימת, תדולג.',
      }],
      onSubmit: async (v) => {
        const lines = v.paste.split(/\r?\n/).map(l => l.split('\t').map(s => s.trim())).filter(c => c.some(Boolean));
        if (lines.length && /שם/.test(lines[0][0] || '') && /נציג/.test(lines[0][4] || '')) lines.shift();
        if (!lines.length) throw new Error('לא הודבקו שורות');
        const rows = lines.map(([name, city, contact, phone, repNameCell]) => ({ name, city, contact, phone, repName: repNameCell }));
        const res = await api('adminImportCustomers', { rows });
        await loadData();
        toast(`יובאו ${res.imported} לקוחות`);
        render('customers');
      },
    });
  }

  /* ------------------------------------------------------------ topics */

  function tabTopics(box) {
    const rows = data.topics.slice();
    box.innerHTML = `<div class="toolbar"><div class="grow muted small">הנושאים מוצגים לנציג לפי הסדר. נושא שאינו פעיל לא יופיע באפליקציה, והדיווחים הקודמים נשמרים.</div>
      <button class="btn" id="add">נושא חדש</button></div>` +
      table([
        { label: 'נושא', key: 'name' },
        { label: 'סדר', key: 'order', cls: 'num' },
        { label: 'סטטוס', render: r => statusPill(r.active) },
      ], rows);
    bindRows(box, rows, topicForm);
    $('#add', box).onclick = () => topicForm({ active: true, order: rows.length + 1 });
  }

  function topicForm(rec) {
    openForm({
      title: rec.id ? 'עריכת נושא' : 'נושא חדש',
      values: rec,
      fields: [
        { key: 'name', label: 'שם הנושא' },
        { key: 'order', label: 'מיקום ברשימה', type: 'number', inputmode: 'numeric' },
        { key: 'active', label: 'נושא פעיל', type: 'checkbox' },
      ],
      onSubmit: (v) => saveRecord('topics', Object.assign({ id: rec.id }, v), 'הנושא נשמר'),
    });
  }

  /* ------------------------------------------------------------ settings */

  function tabSettings(box) {
    const s = data.settings;
    const hours = Array.from({ length: 24 }, (_, h) => [String(h), `${String(h).padStart(2, '0')}:00`]);
    let days = String(s.work_days || '').split(/[,\s]+/).filter(Boolean);
    box.innerHTML = `<form class="card card-pad" novalidate>
      <div class="settings-grid">
        ${field({ key: 'app_name', label: 'שם המערכת' }, s.app_name)}
        ${field({ key: 'manager_emails', label: 'מיילים לקבלת הדוח היומי', dir: 'ltr', hint: 'ניתן להזין כמה כתובות, מופרדות בפסיק' }, s.manager_emails)}
        ${field({ key: 'reminder_hour', label: 'שעת תזכורת לנציגים', type: 'select', options: hours, hint: 'נשלחת רק לנציגים שטרם דיווחו באותו יום' }, s.reminder_hour)}
        ${field({ key: 'summary_hour', label: 'שעת שליחת הדוח המסכם', type: 'select', options: hours, hint: 'הדוח כולל את כל הדיווחים של יום העבודה הקודם' }, s.summary_hour)}
        <div class="field"><span>ימי עבודה</span><div class="days">${DAY_LETTERS.map(d =>
          `<button type="button" class="chip" data-day="${d}" aria-pressed="${days.includes(d)}">${d}׳</button>`).join('')}</div>
          <small class="hint">בימים שאינם ימי עבודה לא יישלחו תזכורות</small></div>
        ${field({ key: 'app_url', label: 'כתובת האפליקציה', dir: 'ltr', hint: 'מופיעה כקישור במיילים' }, s.app_url)}
        ${field({ key: 'admin_code', label: 'קוד מנהל', inputmode: 'numeric', dir: 'ltr', hint: 'לפחות 6 ספרות. לאחר שינוי יש להשתמש בקוד החדש.' }, s.admin_code)}
      </div>
      <div class="form-error"></div>
      <div class="settings-actions"><button class="btn" type="submit">שמירת הגדרות</button></div>
      <hr class="divider">
      <h3 style="margin-bottom:6px">בדיקת מיילים</h3>
      <p class="small muted" style="margin:0 0 14px">שליחת מייל לדוגמה לכתובות המנהל שהוגדרו למעלה.</p>
      <div class="settings-actions">
        <button type="button" class="btn secondary" data-test="summary">שליחת דוח בדיקה (על אתמול)</button>
        <button type="button" class="btn secondary" data-test="reminder">שליחת תזכורת לדוגמה</button>
      </div>
    </form>`;
    const form = $('form', box);
    $$('[data-day]', form).forEach(b => b.onclick = () => {
      const d = b.dataset.day;
      days = days.includes(d) ? days.filter(x => x !== d) : DAY_LETTERS.filter(x => x === d || days.includes(x));
      b.setAttribute('aria-pressed', days.includes(d));
    });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const settings = { work_days: days.join(',') };
      ['app_name', 'manager_emails', 'reminder_hour', 'summary_hour', 'app_url', 'admin_code'].forEach(k => { settings[k] = form[k].value.trim(); });
      if (!/^\d{6,10}$/.test(settings.admin_code)) { $('.form-error', form).textContent = 'קוד מנהל חייב להכיל 6 עד 10 ספרות'; return; }
      const btn = $('button[type="submit"]', form);
      busy(btn, true, 'שומר…');
      try {
        await api('adminSaveSettings', { settings });
        if (settings.admin_code !== App.session.code) App.setSession({ code: settings.admin_code, role: 'admin' });
        await loadData();
        toast('ההגדרות נשמרו');
        render('settings');
      } catch (err) {
        busy(btn, false);
        $('.form-error', form).textContent = err.message;
      }
    };
    $$('[data-test]', form).forEach(b => b.onclick = async () => {
      busy(b, true, 'שולח…');
      try { await api('adminTest', { kind: b.dataset.test }); toast('המייל נשלח'); } catch (err) { toast(err.message, true); }
      busy(b, false);
    });
  }

  window.Admin = {
    render, prime, defaultRange,
    reset() { data = null; reportsFilter = null; lastReports = []; primed = false; try { localStorage.removeItem(LS_ADMIN); } catch (e) { /* ignore */ } },
  };
})();

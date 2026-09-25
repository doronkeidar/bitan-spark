// Demo backend: mirrors the Apps Script API using localStorage, used when CONFIG.API_URL is empty.
(function () {
  const KEY = 'bs_demo_db_v1';
  const DEMO_CODES = { admin: '12345678', reps: ['111111', '222222'] };

  function seed() {
    const today = new Date();
    const iso = (d) => d.toISOString();
    const day = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const ago = (h) => new Date(today.getTime() - h * 3600e3);
    return {
      settings: {
        app_name: 'ביתן ספרק - דיווחי שטח', manager_emails: 'manager@example.com', admin_code: DEMO_CODES.admin,
        reminder_hour: '17', summary_hour: '7', work_days: 'א,ב,ג,ד,ה', app_url: '',
      },
      reps: [
        { id: 'R1', name: 'יוסי כהן', email: 'yossi@example.com', phone: '050-0000001', code: DEMO_CODES.reps[0], active: true },
        { id: 'R2', name: 'מיכל לוי', email: 'michal@example.com', phone: '050-0000002', code: DEMO_CODES.reps[1], active: true },
      ],
      customers: [
        ['C1', 'מחסן חלקים הצפון', 'חיפה', 'R1'], ['C2', 'א.ב חלקי רכב', 'עפולה', 'R1'], ['C3', 'אוטו-פרטס הגליל', 'כרמיאל', 'R1'],
        ['C4', 'חלקי רכב נצרת', 'נצרת', 'R1'], ['C5', 'סיטונאות חלקים המרכז', 'פתח תקווה', 'R2'], ['C6', 'חלקי רכב הדרום', 'באר שבע', 'R2'],
      ].map(([id, name, city, repId]) => ({ id, name, city, contact: '', phone: '', repId, active: true })),
      topics: ['הזמנה חדשה / פוטנציאל הזמנה', 'גבייה / תשלומים', 'תלונה / החזרה / פגם במוצר', 'בקשה לחלק שאין במלאי',
        'מידע על מתחרים / מחירים', 'בקשה להצעת מחיר', 'ביקור שגרתי / שימור קשר', 'לקוח חדש / פוטנציאלי', 'אחר']
        .map((name, i) => ({ id: 'T' + (i + 1), name, order: i + 1, active: true })),
      reports: [
        { id: 'd1', createdAt: iso(ago(26)), date: day(ago(26)), repId: 'R1', repName: 'יוסי כהן', customerId: 'C1', customerName: 'מחסן חלקים הצפון',
          topic: 'בקשה לחלק שאין במלאי', text: 'ביקשו רפידות בלם קדמיות לטויוטה קורולה 2019, כ-40 סטים בחודש. כרגע קונים אצל המתחרה.', photos: [] },
        { id: 'd2', createdAt: iso(ago(27)), date: day(ago(27)), repId: 'R2', repName: 'מיכל לוי', customerId: 'C5', customerName: 'סיטונאות חלקים המרכז',
          topic: 'גבייה / תשלומים', text: 'הבטיחו להעביר את התשלום של חודש שעבר עד יום חמישי.', photos: [] },
      ],
    };
  }

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch (e) { return seed(); } };
  const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage full or blocked */ } };
  const fail = (msg) => { throw new Error(msg); };
  const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const byOrder = (a, b) => (Number(a.order) || 999) - (Number(b.order) || 999);

  function rep(db, code) { return db.reps.find(r => r.active && r.code === String(code || '').trim()) || fail('קוד כניסה שגוי'); }
  function admin(db, code) { if (String(code || '').trim() !== db.settings.admin_code) fail('קוד כניסה שגוי'); }
  function myReports(db, r) { return db.reports.filter(x => x.repId === r.id).slice(-40).reverse(); }

  const actions = {
    login(db, p) {
      if (String(p.code).trim() === db.settings.admin_code) return Object.assign({ role: 'admin' }, actions.adminData(db, p));
      const r = rep(db, p.code);
      return {
        role: 'rep', appName: db.settings.app_name, rep: { id: r.id, name: r.name },
        customers: db.customers.filter(c => c.active && c.repId === r.id).sort((a, b) => a.name.localeCompare(b.name, 'he')),
        topics: db.topics.filter(t => t.active).sort(byOrder).map(t => ({ id: t.id, name: t.name })),
        reports: myReports(db, r),
      };
    },
    submitReport(db, p) {
      const r = rep(db, p.code);
      const x = p.report || {};
      const c = db.customers.find(c => c.id === x.customerId && c.repId === r.id) || fail('הלקוח לא נמצא');
      const t = db.topics.find(t => t.id === x.topicId) || fail('יש לבחור נושא');
      if (db.reports.some(y => y.clientId && y.clientId === x.clientId)) return { duplicate: true };
      db.reports.push({
        id: Math.random().toString(36).slice(2, 10), createdAt: new Date().toISOString(), date: todayStr(), repId: r.id, repName: r.name,
        customerId: c.id, customerName: c.name, topic: t.name, text: x.text || '', clientId: x.clientId,
        photos: (x.photos || []).map(() => ({ url: '#', thumb: '' })),
      });
      return { saved: true };
    },
    myReports(db, p) { return { reports: myReports(db, rep(db, p.code)) }; },
    adminData(db, p) {
      admin(db, p.code);
      const { app_name, manager_emails, admin_code, reminder_hour, summary_hour, work_days, app_url } = db.settings;
      return { appName: app_name, reps: db.reps, customers: db.customers, topics: db.topics.slice().sort(byOrder),
        settings: { app_name, manager_emails, admin_code, reminder_hour, summary_hour, work_days, app_url },
        reports: actions.adminReports(db, p).reports, range: { from: p.from, to: p.to } };
    },
    adminReports(db, p) {
      admin(db, p.code);
      return { reports: db.reports.filter(r => r.date >= (p.from || '0') && r.date <= (p.to || '9') && (!p.repId || r.repId === p.repId)).reverse() };
    },
    adminSave(db, p) {
      admin(db, p.code);
      const list = db[p.table] || fail('טבלה לא מוכרת');
      const rec = Object.assign({}, p.record, { active: p.record.active !== false });
      if (!rec.name) fail('יש למלא שם');
      if (p.table === 'reps') {
        if (!/^\d{4,8}$/.test(rec.code || '')) fail('קוד כניסה חייב להיות 4 עד 8 ספרות');
        if (db.reps.some(r => r.code === rec.code && r.id !== rec.id) || rec.code === db.settings.admin_code) fail('הקוד כבר בשימוש');
      }
      if (p.table === 'customers' && !db.reps.some(r => r.id === rec.repId)) fail('יש לבחור נציג');
      const i = list.findIndex(x => x.id === rec.id);
      if (i === -1) {
        const prefix = { reps: 'R', customers: 'C', topics: 'T' }[p.table];
        rec.id = prefix + (Math.max(0, ...list.map(x => Number(String(x.id).replace(/\D/g, '')) || 0)) + 1);
        list.push(rec);
      } else list[i] = Object.assign(list[i], rec);
      return { record: rec };
    },
    adminImportCustomers(db, p) {
      admin(db, p.code);
      let n = Math.max(0, ...db.customers.map(x => Number(x.id.replace(/\D/g, '')) || 0));
      const errors = [];
      const add = [];
      p.rows.forEach((row, i) => {
        const r = db.reps.find(r => r.name === String(row.repName || '').trim());
        if (!row.name) return;
        if (!r) { errors.push(`שורה ${i + 1}: נציג "${row.repName || ''}" לא נמצא`); return; }
        add.push({ id: 'C' + (++n), name: row.name, city: row.city || '', contact: row.contact || '', phone: row.phone || '', repId: r.id, active: true });
      });
      if (errors.length) fail(errors.slice(0, 8).join('\n'));
      db.customers.push(...add);
      return { imported: add.length };
    },
    adminSaveSettings(db, p) { admin(db, p.code); Object.assign(db.settings, p.settings); return { saved: true }; },
    adminTest(db, p) { admin(db, p.code); return { sent: true }; },
  };

  window.MockApi = {
    codes: DEMO_CODES,
    reset() { localStorage.removeItem(KEY); },
    async call(action, payload) {
      await new Promise(r => setTimeout(r, 350));
      const db = load();
      const fn = actions[action] || fail('פעולה לא מוכרת');
      const res = fn(db, JSON.parse(JSON.stringify(payload)));
      save(db);
      return JSON.parse(JSON.stringify(Object.assign({ ok: true }, res)));
    },
  };
})();

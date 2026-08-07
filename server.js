const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { db, begin, commit, rollback, getBusiness, getUserByToken } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const otpStore = new Map(); // phone -> { otp, expires }

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, name, value, maxAge) {
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Max-Age=${maxAge}`);
}

function auth(required = true) {
  return (req, res, next) => {
    const token = parseCookies(req).ld_token;
    const session = token ? getUserByToken(token) : null;
    if (session) {
      req.user = session.user;
      req.business = session.business;
      req.token = token;
      return next();
    }
    if (!required) return next();
    res.status(401).json({ error: 'Not authenticated' });
  };
}

function bad(msg) {
  return res => res.status(400).json({ error: msg });
}

/* ---------------- Auth ---------------- */

app.post('/api/auth/request-otp', (req, res) => {
  const phone = String(req.body.phone || '').replace(/[^0-9]/g, '').slice(-10);
  if (phone.length !== 10) return bad('Enter a valid 10 digit phone number')(res);
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(phone, { otp, expires: Date.now() + 5 * 60 * 1000 });
  res.json({ ok: true, devOtp: otp });
});

app.post('/api/auth/verify', (req, res) => {
  const phone = String(req.body.phone || '').replace(/[^0-9]/g, '').slice(-10);
  const otp = String(req.body.otp || '').trim();
  const entry = otpStore.get(phone);
  if (!entry || entry.otp !== otp || Date.now() > entry.expires) {
    return bad('Invalid or expired OTP')(res);
  }
  otpStore.delete(phone);

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    begin();
    try {
      const bizRes = db.prepare('INSERT INTO businesses (name, phone) VALUES (?, ?)').run('My Business', phone);
      const bizId = bizRes.lastInsertRowid;
      const uRes = db.prepare('INSERT INTO users (business_id, phone, name, role, is_owner) VALUES (?,?,?,?,1)')
        .run(bizId, phone, 'Owner', 'owner');
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(uRes.lastInsertRowid);
      commit();
    } catch (e) {
      rollback();
      return bad('Could not create account')(res);
    }
  }
  const token = newToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  setCookie(res, 'ld_token', token, 60 * 60 * 24 * 30);
  res.json({ ok: true, user: { id: user.id, phone: user.phone, name: user.name, role: user.role }, business: getBusiness(user.business_id) });
});

app.post('/api/auth/logout', auth(), (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  setCookie(res, 'ld_token', '', 0);
  res.json({ ok: true });
});

app.get('/api/me', auth(), (req, res) => {
  res.json({ user: req.user, business: req.business });
});

/* ---------------- Business ---------------- */

app.put('/api/business', auth(), (req, res) => {
  const { name, owner_name, phone, address, currency, fiscal_year_start } = req.body;
  if (!name || !String(name).trim()) return bad('Business name is required')(res);
  db.prepare('UPDATE businesses SET name=?, owner_name=?, phone=?, address=?, currency=?, fiscal_year_start=? WHERE id=?')
    .run(String(name).trim(), owner_name || '', phone || '', address || '', currency || 'NPR', fiscal_year_start || '2025-04-01', req.business.id);
  res.json({ ok: true, business: getBusiness(req.business.id) });
});

/* ---------------- Dashboard ---------------- */

app.get('/api/summary', auth(), (req, res) => {
  const b = req.business.id;
  const t = (sql) => db.prepare(sql).get(b);
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = db.prepare(`SELECT type, COALESCE(SUM(amount),0) amt FROM transactions WHERE business_id=? AND date=? GROUP BY type`).all(b, today);
  const todayTotals = { sale: 0, purchase: 0, expense: 0, payment_in: 0, payment_out: 0 };
  todayRow.forEach(r => todayTotals[r.type] = r.amt);

  const recv = db.prepare(`SELECT COALESCE(SUM(p.opening_balance),0) ob FROM parties p WHERE p.business_id=? AND p.type='customer'`).get(b).ob
    + db.prepare(`SELECT COALESCE(SUM(CASE WHEN t.type='sale' THEN t.amount WHEN t.type='payment_in' THEN -t.amount ELSE 0 END),0) v FROM transactions t WHERE t.business_id=? AND t.type IN ('sale','payment_in')`).get(b).v;
  const pay = db.prepare(`SELECT COALESCE(SUM(p.opening_balance),0) ob FROM parties p WHERE p.business_id=? AND p.type='supplier'`).get(b).ob
    + db.prepare(`SELECT COALESCE(SUM(CASE WHEN t.type='purchase' THEN t.amount WHEN t.type='payment_out' THEN -t.amount ELSE 0 END),0) v FROM transactions t WHERE t.business_id=? AND t.type IN ('purchase','payment_out')`).get(b).v;

  const recent = db.prepare(`SELECT t.*, p.name party_name, i.name item_name FROM transactions t
    LEFT JOIN parties p ON p.id = t.party_id LEFT JOIN items i ON i.id = t.item_id
    WHERE t.business_id=? ORDER BY t.date DESC, t.id DESC LIMIT 8`).all(b);

  const todayCounts = db.prepare(`SELECT type, COUNT(*) c FROM transactions WHERE business_id=? AND date=? GROUP BY type`).all(b, today);
  const tCounts = { sale: 0, purchase: 0, expense: 0, payment_in: 0, payment_out: 0 };
  todayCounts.forEach(r => tCounts[r.type] = r.c);

  const lowStock = db.prepare(`SELECT * FROM items WHERE business_id=? AND stock <= low_stock AND low_stock > 0 ORDER BY stock ASC LIMIT 6`).all(b);

  const monthly = db.prepare(`SELECT substr(date,1,7) m, type, SUM(amount) amt FROM transactions WHERE business_id=? GROUP BY m, type ORDER BY m DESC LIMIT 12`).all(b);

  res.json({ today: todayTotals, todayCounts: tCounts, totalReceivable: recv, totalPayable: pay, recent, lowStock, monthly });
});

/* ---------------- Parties ---------------- */

app.get('/api/parties', auth(), (req, res) => {
  const { type, q } = req.query;
  let sql = 'SELECT * FROM parties WHERE business_id=?';
  const params = [req.business.id];
  if (type) { sql += ' AND type=?'; params.push(type); }
  if (q) { sql += ' AND name LIKE ?'; params.push('%' + q + '%'); }
  sql += ' ORDER BY name COLLATE NOCASE';
  const parties = db.prepare(sql).all(...params).map(p => {
    const t = db.prepare(`SELECT COALESCE(SUM(CASE WHEN type IN ('sale','purchase') THEN amount WHEN type IN ('payment_in','payment_out') THEN -amount ELSE 0 END),0) v FROM transactions WHERE business_id=? AND party_id=?`).get(req.business.id, p.id).v;
    const balance = Math.round((p.opening_balance + t) * 100) / 100;
    return { ...p, balance };
  });
  res.json({ parties });
});

app.post('/api/parties', auth(), (req, res) => {
  const { type, name, phone, email, address, opening_balance, note } = req.body;
  if (!['customer', 'supplier'].includes(type)) return bad('Invalid type')(res);
  if (!name || !String(name).trim()) return bad('Name is required')(res);
  const r = db.prepare('INSERT INTO parties (business_id, type, name, phone, email, address, opening_balance, note) VALUES (?,?,?,?,?,?,?,?)')
    .run(req.business.id, type, String(name).trim(), phone || '', email || '', address || '', Number(opening_balance) || 0, note || '');
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.put('/api/parties/:id', auth(), (req, res) => {
  const p = db.prepare('SELECT * FROM parties WHERE id=? AND business_id=?').get(req.params.id, req.business.id);
  if (!p) return bad('Party not found')(res);
  const { type, name, phone, email, address, opening_balance, note } = req.body;
  db.prepare('UPDATE parties SET type=?, name=?, phone=?, email=?, address=?, opening_balance=?, note=? WHERE id=?')
    .run(type || p.type, name || p.name, phone ?? p.phone, email ?? p.email, address ?? p.address, Number(opening_balance ?? p.opening_balance), note ?? p.note, p.id);
  res.json({ ok: true });
});

app.delete('/api/parties/:id', auth(), (req, res) => {
  const p = db.prepare('SELECT * FROM parties WHERE id=? AND business_id=?').get(req.params.id, req.business.id);
  if (!p) return bad('Party not found')(res);
  db.prepare('DELETE FROM parties WHERE id=?').run(p.id);
  res.json({ ok: true });
});

app.get('/api/parties/:id/ledger', auth(), (req, res) => {
  const p = db.prepare('SELECT * FROM parties WHERE id=? AND business_id=?').get(req.params.id, req.business.id);
  if (!p) return bad('Party not found')(res);
  const rows = db.prepare(`SELECT t.*, i.name item_name FROM transactions t
    LEFT JOIN items i ON i.id=t.item_id
    WHERE t.business_id=? AND t.party_id=? ORDER BY t.date ASC, t.id ASC`).all(req.business.id, p.id);
  let running = p.opening_balance;
  const lines = rows.map(r => {
    const delta = ['sale', 'purchase'].includes(r.type) ? r.amount : -r.amount;
    running = Math.round((running + delta) * 100) / 100;
    return { ...r, delta, balance: running };
  });
  res.json({ party: p, lines, closing: running });
});

/* ---------------- Items ---------------- */

app.get('/api/items', auth(), (req, res) => {
  const { q } = req.query;
  let sql = 'SELECT * FROM items WHERE business_id=?';
  const params = [req.business.id];
  if (q) { sql += ' AND name LIKE ?'; params.push('%' + q + '%'); }
  sql += ' ORDER BY name COLLATE NOCASE';
  res.json({ items: db.prepare(sql).all(...params) });
});

app.post('/api/items', auth(), (req, res) => {
  const { name, unit, purchase_price, sale_price, stock, low_stock } = req.body;
  if (!name || !String(name).trim()) return bad('Item name is required')(res);
  const r = db.prepare('INSERT INTO items (business_id, name, unit, purchase_price, sale_price, stock, low_stock) VALUES (?,?,?,?,?,?,?)')
    .run(req.business.id, String(name).trim(), unit || 'pcs', Number(purchase_price) || 0, Number(sale_price) || 0, Number(stock) || 0, Number(low_stock) || 0);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.put('/api/items/:id', auth(), (req, res) => {
  const it = db.prepare('SELECT * FROM items WHERE id=? AND business_id=?').get(req.params.id, req.business.id);
  if (!it) return bad('Item not found')(res);
  const { name, unit, purchase_price, sale_price, stock, low_stock } = req.body;
  db.prepare('UPDATE items SET name=?, unit=?, purchase_price=?, sale_price=?, stock=?, low_stock=? WHERE id=?')
    .run(name || it.name, unit || it.unit, Number(purchase_price ?? it.purchase_price), Number(sale_price ?? it.sale_price), Number(stock ?? it.stock), Number(low_stock ?? it.low_stock), it.id);
  res.json({ ok: true });
});

app.delete('/api/items/:id', auth(), (req, res) => {
  const it = db.prepare('SELECT * FROM items WHERE id=? AND business_id=?').get(req.params.id, req.business.id);
  if (!it) return bad('Item not found')(res);
  db.prepare('DELETE FROM items WHERE id=?').run(it.id);
  res.json({ ok: true });
});

/* ---------------- Transactions ---------------- */

function adjustStock(itemId, delta) {
  db.prepare('UPDATE items SET stock = stock + ? WHERE id=?').run(delta, itemId);
}

app.post('/api/transactions', auth(), (req, res) => {
  const { type, date, party_id, item_id, quantity, rate, amount, payment_method, note } = req.body;
  const allowed = ['sale', 'purchase', 'expense', 'payment_in', 'payment_out'];
  if (!allowed.includes(type)) return bad('Invalid transaction type')(res);
  const d = date || new Date().toISOString().slice(0, 10);
  const amt = Number(amount) || 0;
  if (amt <= 0) return bad('Amount must be greater than zero')(res);

  const txn = { type, date: d, party_id: party_id || null, item_id: item_id || null, quantity: Number(quantity) || 0, rate: Number(rate) || 0, amount: amt, payment_method: payment_method || '', note: note || '' };
  begin();
  try {
    const r = db.prepare(`INSERT INTO transactions (business_id, type, date, party_id, item_id, quantity, rate, amount, payment_method, note) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(req.business.id, txn.type, txn.date, txn.party_id, txn.item_id, txn.quantity, txn.rate, txn.amount, txn.payment_method, txn.note);
    if (txn.item_id) {
      if (type === 'sale') adjustStock(txn.item_id, -txn.quantity);
      if (type === 'purchase') adjustStock(txn.item_id, txn.quantity);
    }
    commit();
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) {
    rollback();
    bad('Failed to save transaction')(res);
  }
});

app.get('/api/transactions', auth(), (req, res) => {
  const { type, party_id, item_id, from, to, q, page, limit } = req.query;
  const where = ['t.business_id=?'];
  const params = [req.business.id];
  if (type) { where.push('t.type=?'); params.push(type); }
  if (party_id) { where.push('t.party_id=?'); params.push(Number(party_id)); }
  if (item_id) { where.push('t.item_id=?'); params.push(Number(item_id)); }
  if (from) { where.push('t.date>=?'); params.push(from); }
  if (to) { where.push('t.date<=?'); params.push(to); }
  if (q) { where.push('(t.note LIKE ? OR p.name LIKE ? OR i.name LIKE ?)'); params.push('%' + q + '%', '%' + q + '%', '%' + q + '%'); }
  const total = db.prepare(`SELECT COUNT(*) c FROM transactions t LEFT JOIN parties p ON p.id=t.party_id LEFT JOIN items i ON i.id=t.item_id WHERE ${where.join(' AND ')}`).get(...params).c;
  const per = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const rows = db.prepare(`SELECT t.*, p.name party_name, i.name item_name, i.unit item_unit FROM transactions t
    LEFT JOIN parties p ON p.id=t.party_id LEFT JOIN items i ON i.id=t.item_id
    WHERE ${where.join(' AND ')} ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`).all(...params, per, (pg - 1) * per);
  res.json({ transactions: rows, total, page: pg, pages: Math.max(1, Math.ceil(total / per)) });
});

app.put('/api/transactions/:id', auth(), (req, res) => {
  const old = db.prepare('SELECT * FROM transactions WHERE id=? AND business_id=?').get(req.params.id, req.business.id);
  if (!old) return bad('Transaction not found')(res);
  const allowed = ['sale', 'purchase', 'expense', 'payment_in', 'payment_out'];
  const type = req.body.type || old.type;
  if (!allowed.includes(type)) return bad('Invalid transaction type')(res);
  const amt = Number(req.body.amount ?? old.amount) || 0;
  const quantity = Number(req.body.quantity ?? old.quantity) || 0;

  // revert old stock effect, then apply new one
  const revert = (t) => {
    if (!t.item_id) return;
    if (t.type === 'sale') adjustStock(t.item_id, t.quantity);
    if (t.type === 'purchase') adjustStock(t.item_id, -t.quantity);
  };
  const apply = (t) => {
    if (!t.item_id) return;
    if (t.type === 'sale') adjustStock(t.item_id, -t.quantity);
    if (t.type === 'purchase') adjustStock(t.item_id, t.quantity);
  };

  begin();
  try {
    revert(old);
    const next = {
      type,
      date: req.body.date || old.date,
      party_id: req.body.party_id ?? old.party_id,
      item_id: req.body.item_id ?? old.item_id,
      quantity,
      rate: Number(req.body.rate ?? old.rate) || 0,
      amount: amt,
      payment_method: req.body.payment_method ?? old.payment_method,
      note: req.body.note ?? old.note,
    };
    apply(next);
    db.prepare('UPDATE transactions SET type=?, date=?, party_id=?, item_id=?, quantity=?, rate=?, amount=?, payment_method=?, note=? WHERE id=?')
      .run(next.type, next.date, next.party_id, next.item_id, next.quantity, next.rate, next.amount, next.payment_method, next.note, old.id);
    commit();
    res.json({ ok: true });
  } catch (e) {
    rollback();
    bad('Failed to update transaction')(res);
  }
});

app.delete('/api/transactions/:id', auth(), (req, res) => {
  const old = db.prepare('SELECT * FROM transactions WHERE id=? AND business_id=?').get(req.params.id, req.business.id);
  if (!old) return bad('Transaction not found')(res);
  begin();
  try {
    if (old.item_id) {
      if (old.type === 'sale') adjustStock(old.item_id, old.quantity);
      if (old.type === 'purchase') adjustStock(old.item_id, -old.quantity);
    }
    db.prepare('DELETE FROM transactions WHERE id=?').run(old.id);
    commit();
    res.json({ ok: true });
  } catch (e) {
    rollback();
    bad('Failed to delete transaction')(res);
  }
});

/* ---------------- Reports ---------------- */

app.get('/api/reports', auth(), (req, res) => {
  const { from, to } = req.query;
  const where = ['t.business_id=?'];
  const params = [req.business.id];
  if (from) { where.push('t.date>=?'); params.push(from); }
  if (to) { where.push('t.date<=?'); params.push(to); }
  const cond = where.join(' AND ');

  const totals = db.prepare(`SELECT t.type, COALESCE(SUM(t.amount),0) amt FROM transactions t WHERE ${cond} GROUP BY t.type`).all(...params);
  const byType = { sale: 0, purchase: 0, expense: 0, payment_in: 0, payment_out: 0 };
  totals.forEach(r => byType[r.type] = r.amt);

  const topItems = db.prepare(`SELECT i.name, i.unit, COALESCE(SUM(t.quantity),0) qty, COALESCE(SUM(t.amount),0) amt
    FROM transactions t JOIN items i ON i.id=t.item_id
    WHERE ${cond} AND t.type='sale' AND t.item_id IS NOT NULL GROUP BY t.item_id ORDER BY amt DESC LIMIT 10`).all(...params);

  const topCustomers = db.prepare(`SELECT p.name, COALESCE(SUM(t.amount),0) amt
    FROM transactions t JOIN parties p ON p.id=t.party_id
    WHERE ${cond} AND t.type='sale' AND t.party_id IS NOT NULL GROUP BY t.party_id ORDER BY amt DESC LIMIT 10`).all(...params);

  const expenseByNote = db.prepare(`SELECT COALESCE(t.note,'General') name, SUM(t.amount) amt FROM transactions t WHERE ${cond} AND t.type='expense' GROUP BY t.note ORDER BY amt DESC LIMIT 10`).all(...params);

  const profit = byType.sale - byType.purchase - byType.expense;

  res.json({ from, to, byType, profit, topItems, topCustomers, expenseByNote });
});

/* ---------------- Staff ---------------- */

app.get('/api/staff', auth(), (req, res) => {
  res.json({ staff: db.prepare('SELECT id, phone, name, role, is_owner FROM users WHERE business_id=? ORDER BY id').all(req.business.id) });
});

app.post('/api/staff', auth(), (req, res) => {
  const { name, phone, role } = req.body;
  const ph = String(phone || '').replace(/[^0-9]/g, '').slice(-10);
  if (ph.length !== 10) return bad('Enter a valid 10 digit phone number')(res);
  const exists = db.prepare('SELECT * FROM users WHERE phone=?').get(ph);
  if (exists) return bad('A user with this phone already exists')(res);
  const r = db.prepare('INSERT INTO users (business_id, phone, name, role, is_owner) VALUES (?,?,?,?,0)')
    .run(req.business.id, ph, name || 'Staff', role || 'staff');
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.delete('/api/staff/:id', auth(), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=? AND business_id=?').get(req.params.id, req.business.id);
  if (!u) return bad('User not found')(res);
  if (u.is_owner) return bad('Cannot remove the owner')(res);
  db.prepare('DELETE FROM users WHERE id=?').run(u.id);
  res.json({ ok: true });
});

/* ---------------- Backup ---------------- */

app.get('/api/export', auth(), (req, res) => {
  const b = req.business.id;
  const data = {
    app: 'len-den',
    version: 1,
    exportedAt: new Date().toISOString(),
    business: getBusiness(b),
    parties: db.prepare('SELECT * FROM parties WHERE business_id=?').all(b),
    items: db.prepare('SELECT * FROM items WHERE business_id=?').all(b),
    transactions: db.prepare('SELECT * FROM transactions WHERE business_id=?').all(b),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="len-den-backup.json"');
  res.json(data);
});

app.post('/api/import', auth(), (req, res) => {
  const data = req.body;
  if (!data || data.app !== 'len-den' || !Array.isArray(data.parties)) return bad('Invalid backup file')(res);
  const b = req.business.id;
  const idMap = {};
  begin();
  try {
    db.prepare('DELETE FROM transactions WHERE business_id=?').run(b);
    db.prepare('DELETE FROM parties WHERE business_id=?').run(b);
    db.prepare('DELETE FROM items WHERE business_id=?').run(b);
    for (const p of data.parties) {
      const r = db.prepare('INSERT INTO parties (business_id, type, name, phone, email, address, opening_balance, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(b, p.type, p.name, p.phone || '', p.email || '', p.address || '', p.opening_balance || 0, p.note || '', p.created_at || new Date().toISOString());
      idMap['p' + p.id] = r.lastInsertRowid;
    }
    const itemMap = {};
    for (const it of data.items) {
      const r = db.prepare('INSERT INTO items (business_id, name, unit, purchase_price, sale_price, stock, low_stock, created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(b, it.name, it.unit || 'pcs', it.purchase_price || 0, it.sale_price || 0, it.stock || 0, it.low_stock || 0, it.created_at || new Date().toISOString());
      itemMap['i' + it.id] = r.lastInsertRowid;
    }
    for (const t of data.transactions) {
      db.prepare('INSERT INTO transactions (business_id, type, date, party_id, item_id, quantity, rate, amount, payment_method, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(b, t.type, t.date, t.party_id ? (idMap['p' + t.party_id] || null) : null, t.item_id ? (itemMap['i' + t.item_id] || null) : null, t.quantity || 0, t.rate || 0, t.amount, t.payment_method || '', t.note || '', t.created_at || new Date().toISOString());
    }
    commit();
    res.json({ ok: true, business: getBusiness(b) });
  } catch (e) {
    rollback();
    bad('Import failed: invalid data')(res);
  }
});

/* ---------------- Pages ---------------- */

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.listen(PORT, () => {
  console.log('Len Den running at http://localhost:' + PORT);
});

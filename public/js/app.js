/* Len Den — main app */

const state = {
  user: null,
  business: null,
  view: 'dashboard',
  parties: [],
  items: [],
  txnPage: 1,
  txnFilter: { type: '', party_id: '', item_id: '', from: '', to: '', q: '' },
  reportRange: 'week',
  ledgerParty: null,
};

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt(n) {
  n = Number(n) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n * 100) / 100);
  const parts = String(abs).split('.');
  let i = parts[0], d = parts[1] || '';
  let out = i;
  if (i.length > 3) {
    const last3 = i.slice(-3);
    let rest = i.slice(0, -3);
    const groups = [];
    while (rest.length > 2) { groups.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
    if (rest) groups.unshift(rest);
    out = groups.join(',') + ',' + last3;
  }
  return sign + out + (d ? '.' + d : '');
}
const rs = n => 'Rs. ' + fmt(n);

function today() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}
function rangeDays(n) {
  const t = new Date();
  t.setDate(t.getDate() - n);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}
function prettyDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return day + ' ' + months[Number(m) - 1] + ' ' + y;
}

function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function openModal(title, bodyHtml, footHtml) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ''}
    </div>`;
  wrap.querySelector('[data-close]').addEventListener('click', () => wrap.remove());
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) wrap.remove(); });
  $('modals').appendChild(wrap);
  return wrap;
}

function closeModal(wrap) { if (wrap) wrap.remove(); }

function loading(html) { return '<div class="empty">' + (html || 'Loading...') + '</div>'; }

/* ---------- bar chart ---------- */
function barChart(canvasId, labels, values, color) {
  const cv = document.getElementById(canvasId);
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 600, H = 240;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const max = Math.max(...values, 1);
  const pad = 8;
  const bw = W / labels.length;
  const barW = Math.min(38, bw * 0.55);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9aa0b5';
  ctx.font = '11px Inter, sans-serif';
  values.forEach((v, i) => {
    const h = Math.max(2, (v / max) * (H - 56));
    const x = bw * i + (bw - barW) / 2;
    const y = H - 28 - h;
    const grad = ctx.createLinearGradient(0, y, 0, H - 28);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + '55');
    ctx.fillStyle = grad;
    ctx.beginPath();
    const r = 4;
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + barW - r, y);
    ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
    ctx.lineTo(x + barW, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1b1e2b';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillText(shortAmt(v), x + barW / 2, y - 6);
    ctx.fillStyle = '#9aa0b5';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(labels[i], x + barW / 2, H - 12);
  });
}
function shortAmt(n) {
  const a = Math.abs(n);
  if (a >= 10000000) return fmt(n / 10000000) + 'Cr';
  if (a >= 100000) return fmt(n / 100000) + 'L';
  if (a >= 1000) return fmt(n / 1000) + 'k';
  return fmt(n);
}

/* ---------- boot ---------- */
async function boot() {
  let me;
  try { me = await api('/me'); }
  catch { location.href = '/login'; return; }
  state.user = me.user;
  state.business = me.business;
  $('brandBiz').textContent = 'Len Den';
  $('brandSub').textContent = me.business.name;
  $('userName').textContent = me.user.name || (me.user.is_owner ? 'Owner' : 'Staff');
  $('userPhone').textContent = '+977 ' + me.user.phone;
  $('userAvatar').textContent = ($('userName').textContent || 'O')[0].toUpperCase();
  $('tbDate').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('logoutBtn').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    location.href = '/login';
  });
  navBind();
  await loadRefs();
  route();
}

function navBind() {
  $$('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.view === state.view) return;
      state.view = el.dataset.view;
      state.txnPage = 1;
      state.txnFilter = { type: '', party_id: '', item_id: '', from: '', to: '', q: '' };
      state.ledgerParty = null;
      route();
    });
  });
  $('globalSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      state.txnFilter.q = e.target.value;
      if (state.view === 'khata') route();
    }
  });
}

function setTitle(t) {
  $('tbTitle').textContent = t;
  document.title = t + ' | Len Den';
}

async function loadRefs() {
  const [p, it] = await Promise.all([api('/parties'), api('/items')]);
  state.parties = p.parties;
  state.items = it.items;
}

async function route() {
  const v = state.view;
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === v));
  $('globalSearchWrap').classList.toggle('hidden', v !== 'khata');
  try {
    if (v === 'dashboard') await renderDashboard();
    else if (v === 'khata') await renderKhata();
    else if (v === 'parties') await renderParties();
    else if (v === 'ledger') await renderLedger();
    else if (v === 'items') await renderItems();
    else if (v === 'reports') await renderReports();
    else if (v === 'staff') await renderStaff();
    else if (v === 'settings') await renderSettings();
  } catch (e) {
    $('view').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
  }
}

/* ---------- Dashboard ---------- */
async function renderDashboard() {
  setTitle('Dashboard');
  const d = await api('/summary');
  const s = d.today;
  const income = s.sale + s.payment_in;
  const outcome = s.purchase + s.expense + s.payment_out;
  const net = income - outcome;
  const txnTypes = { sale: ['Sale', 'success'], purchase: ['Purchase', 'info'], expense: ['Expense', 'danger'], payment_in: ['Received', 'success'], payment_out: ['Paid out', 'warning'] };

  const recentHtml = d.recent.length ? d.recent.map(t => {
    const meta = txnTypes[t.type] || [t.type, 'soft'];
    const amtCls = ['sale', 'payment_in'].includes(t.type) ? 'pos' : 'neg';
    return `<tr>
      <td><span class="badge badge-${meta[1]}">${meta[0]}</span></td>
      <td>${esc(t.party_name || t.item_name || t.note || '—')}</td>
      <td class="amount ${amtCls}">${rs(t.amount)}</td>
      <td>${prettyDate(t.date)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="4"><div class="empty">No transactions yet</div></td></tr>';

  const lowHtml = d.lowStock.length ? d.lowStock.map(i =>
    `<div class="row spread" style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div><b>${esc(i.name)}</b><div class="hint" style="color:var(--text-tertiary);font-size:12px">${i.unit}</div></div>
      <span class="badge badge-danger">${fmt(i.stock)} left</span>
    </div>`).join('') : '<div class="empty">All stock is healthy</div>';

  const monthly = (d.monthly || []).slice(0, 6).reverse();
  const agg = {};
  monthly.forEach(m => { agg[m.m] = agg[m.m] || { sale: 0, out: 0 }; if (m.type === 'sale') agg[m.m].sale += m.amt; else if (['purchase', 'expense'].includes(m.type)) agg[m.m].out += m.amt; });
  const mlab = Object.keys(agg);
  const mSalesA = mlab.map(k => agg[k].sale);
  const mKeys = Object.keys(agg);
  const curMonth = mKeys[mKeys.length - 1];
  const curProfit = curMonth ? agg[curMonth].sale - agg[curMonth].out : 0;
  const salesCount = d.todayCounts ? d.todayCounts.sale : 0;

  $('view').innerHTML = `
    <div class="stats">
      <div class="stat sale"><div class="s-label">Today's Sales <span>🧾</span></div><div class="s-value pos">${rs(s.sale)}</div><div class="s-note">${salesCount ? salesCount + ' sale' + (salesCount === 1 ? '' : 's') + ' today' : 'No sales today'}</div></div>
      <div class="stat purchase"><div class="s-label">Today's Purchases <span>🛒</span></div><div class="s-value">${rs(s.purchase)}</div></div>
      <div class="stat expense"><div class="s-label">Today's Expenses <span>💸</span></div><div class="s-value neg">${rs(s.expense)}</div></div>
      <div class="stat cash"><div class="s-label">Net cash today <span>💵</span></div><div class="s-value ${net >= 0 ? 'pos' : 'neg'}">${rs(net)}</div><div class="s-note">In ${rs(income)} · Out ${rs(outcome)}</div></div>
    </div>
    <div class="stats mt-16">
      <div class="stat recv"><div class="s-label">Total Receivable <span>👥</span></div><div class="s-value">${rs(d.totalReceivable)}</div><div class="s-note">What customers owe you</div></div>
      <div class="stat pay"><div class="s-label">Total Payable <span>🧑‍🤝‍🧑</span></div><div class="s-value">${rs(d.totalPayable)}</div><div class="s-note">What you owe suppliers</div></div>
      <div class="stat profit"><div class="s-label">This month's profit <span>📈</span></div><div class="s-value ${curProfit >= 0 ? 'pos' : 'neg'}">${rs(curProfit)}</div><div class="s-note">Sales − purchases − expenses</div></div>
    </div>
    <div class="grid-2 mt-16">
      <div class="card card-pad">
        <div class="row spread mb-16"><h3>Sales vs Expenses</h3><span class="badge badge-soft">6 months</span></div>
        ${mSalesA.length ? `<canvas class="chart" id="chartMain"></canvas>` : '<div class="empty">Not enough data</div>'}
      </div>
      <div class="card card-pad">
        <div class="row spread mb-16"><h3>Low stock alert</h3><button class="btn btn-sm" onclick="go('items')">Manage</button></div>
        ${lowHtml}
      </div>
    </div>
    <div class="card card-pad mt-16">
      <div class="row spread mb-16"><h3>Recent transactions</h3><button class="btn btn-sm" onclick="go('khata')">View all</button></div>
      <div class="table-wrap"><table><thead><tr><th>Type</th><th>Party / Item</th><th>Amount</th><th>Date</th></tr></thead><tbody>${recentHtml}</tbody></table></div>
    </div>`;

  if (mSalesA.length) {
    requestAnimationFrame(() => {
      barChart('chartMain', mlab.map(k => k.slice(5) + '/' + k.slice(2, 4)), mSalesA, '#6359e0');
    });
  }
}

function go(v) {
  state.view = v;
  state.txnPage = 1;
  state.txnFilter = { type: '', party_id: '', item_id: '', from: '', to: '', q: '' };
  route();
}

/* ---------- Khata / Transactions ---------- */
async function renderKhata() {
  setTitle('Transactions');
  const f = state.txnFilter;
  const q = new URLSearchParams({ type: f.type, party_id: f.party_id, item_id: f.item_id, from: f.from, to: f.to, q: f.q, page: state.txnPage, limit: 25 }).toString();
  const d = await api('/transactions?' + q);
  const txnTypes = { sale: ['Sale', 'success'], purchase: ['Purchase', 'info'], expense: ['Expense', 'danger'], payment_in: ['Received', 'success'], payment_out: ['Paid out', 'warning'] };

  const tabs = [['', 'All'], ['sale', 'Sales'], ['purchase', 'Purchases'], ['expense', 'Expenses'], ['payment_in', 'Received'], ['payment_out', 'Paid out']]
    .map(([v, l]) => `<button class="${f.type === v ? 'active' : ''}" onclick="setTxnType('${v}')">${l}</button>`).join('');

  const rows = d.transactions.map(t => {
    const meta = txnTypes[t.type] || [t.type, 'soft'];
    const amtCls = ['sale', 'payment_in'].includes(t.type) ? 'pos' : 'neg';
    return `<tr>
      <td><span class="badge badge-${meta[1]}">${meta[0]}</span></td>
      <td>${prettyDate(t.date)}</td>
      <td><b>${esc(t.party_name || t.item_name || (t.note || '—'))}</b>${t.item_name ? `<div class="hint" style="color:var(--text-tertiary);font-size:11px">${esc(t.item_name)}</div>` : ''}</td>
      <td class="amount ${amtCls}">${rs(t.amount)}</td>
      <td>${t.payment_method ? esc(t.payment_method) : '—'}</td>
      <td>
        <button class="btn btn-sm" onclick="editTxn(${t.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="delTxn(${t.id})">Delete</button>
      </td>
    </tr>`;
  }).join('');

  const partyOpts = `<option value="">All parties</option>` + state.parties.map(p => `<option value="${p.id}" ${String(f.party_id) === String(p.id) ? 'selected' : ''}>${esc(p.name)} (${p.type})</option>`).join('');
  const itemOpts = `<option value="">All items</option>` + state.items.map(i => `<option value="${i.id}" ${String(f.item_id) === String(i.id) ? 'selected' : ''}>${esc(i.name)}</option>`).join('');

  $('view').innerHTML = `
    <div class="row spread">
      <div><div class="page-title">Transactions</div><div class="page-sub">${d.total} record${d.total === 1 ? '' : 's'} found</div></div>
      <button class="btn btn-primary" onclick="addTxn()">+ Add transaction</button>
    </div>
    <div class="card card-pad mt-8">
      <div class="toolbar">
        <div class="seg">${tabs}</div>
      </div>
      <div class="toolbar">
        <select class="select" style="width:170px" onchange="setTxnParty(this.value)">${partyOpts}</select>
        <select class="select" style="width:170px" onchange="setTxnItem(this.value)">${itemOpts}</select>
        <input type="date" class="input" style="width:160px" value="${f.from}" onchange="setTxnFrom(this.value)"/>
        <span style="color:var(--text-tertiary)">to</span>
        <input type="date" class="input" style="width:160px" value="${f.to}" onchange="setTxnTo(this.value)"/>
        <div class="spacer"></div>
        <button class="btn btn-sm" onclick="resetTxnFilter()">Reset</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Type</th><th>Date</th><th>Party / Note</th><th>Amount</th><th>Method</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6"><div class="empty">No transactions match your filter</div></td></tr>'}</tbody></table>
      </div>
      ${d.pages > 1 ? `<div class="row" style="justify-content:center;padding:14px">
        <button class="btn btn-sm" ${d.page <= 1 ? 'disabled' : ''} onclick="pageTxn(${d.page - 1})">← Prev</button>
        <span style="color:var(--text-tertiary);font-size:13px">Page ${d.page} of ${d.pages}</span>
        <button class="btn btn-sm" ${d.page >= d.pages ? 'disabled' : ''} onclick="pageTxn(${d.page + 1})">Next →</button>
      </div>` : ''}
    </div>`;
}

function setTxnType(t) { state.txnFilter.type = t; state.txnPage = 1; route(); }
function setTxnParty(v) { state.txnFilter.party_id = v; state.txnPage = 1; route(); }
function setTxnItem(v) { state.txnFilter.item_id = v; state.txnPage = 1; route(); }
function setTxnFrom(v) { state.txnFilter.from = v; route(); }
function setTxnTo(v) { state.txnFilter.to = v; route(); }
function resetTxnFilter() { state.txnFilter = { type: '', party_id: '', item_id: '', from: '', to: '', q: '' }; state.txnPage = 1; route(); }
function pageTxn(p) { state.txnPage = p; route(); }

function txnModal(txn) {
  const editing = !!txn;
  const defType = txn ? txn.type : 'sale';
  const customers = state.parties.filter(p => p.type === 'customer');
  const suppliers = state.parties.filter(p => p.type === 'supplier');
  const partyOpts = (list, sel) => `<option value="">— Select —</option>` + list.map(p => `<option value="${p.id}" ${Number(sel) === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const itemOpts = `<option value="">— None —</option>` + state.items.map(i => `<option value="${i.id}" ${Number(txn && txn.item_id) === i.id ? 'selected' : ''}>${esc(i.name)} (${fmt(i.stock)} ${i.unit} in stock)</option>`).join('');
  const types = [['sale', 'Sale (khata baki)'], ['purchase', 'Purchase'], ['expense', 'Expense'], ['payment_in', 'Payment received'], ['payment_out', 'Payment made']];

  const wrap = openModal(editing ? 'Edit transaction' : 'Add transaction', `
    <div class="field"><label>Transaction type</label>
      <select class="select" id="f_type">${types.map(([v, l]) => `<option value="${v}" ${defType === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div id="partyField"><div class="field"><label id="partyLabel">Customer</label>
      <select class="select" id="f_party">${partyOpts(customers, txn && txn.party_id)}</select>
    </div></div>
    <div id="itemField" class="${defType === 'expense' ? 'hidden' : ''}">
      <div class="field"><label>Item</label><select class="select" id="f_item">${itemOpts}</select></div>
      <div class="row">
        <div class="field" style="flex:1"><label>Quantity</label><input class="input" id="f_qty" type="number" min="0" step="any" value="${txn && txn.quantity ? txn.quantity : 1}" oninput="calcAmt()"/></div>
        <div class="field" style="flex:1"><label>Rate</label><input class="input" id="f_rate" type="number" min="0" step="any" value="${txn && txn.rate ? txn.rate : ''}" oninput="calcAmt()"/></div>
      </div>
    </div>
    <div class="field"><label>Amount (Rs.)</label><input class="input" id="f_amount" type="number" min="0" step="any" value="${txn ? txn.amount : ''}" oninput="manualAmt()"/></div>
    <div class="row">
      <div class="field" style="flex:1"><label>Date</label><input class="input" id="f_date" type="date" value="${txn ? txn.date : today()}"/></div>
      <div class="field" style="flex:1"><label>Payment method</label>
        <select class="select" id="f_method"><option value="">Cash</option><option ${txn && txn.payment_method === 'Bank' ? 'selected' : ''}>Bank</option><option ${txn && txn.payment_method === 'Khalti' ? 'selected' : ''}>Khalti</option><option ${txn && txn.payment_method === 'eSewa' ? 'selected' : ''}>eSewa</option><option ${txn && txn.payment_method === 'Mobile Banking' ? 'selected' : ''}>Mobile Banking</option><option ${txn && txn.payment_method === 'Cheque' ? 'selected' : ''}>Cheque</option></select>
      </div>
    </div>
    <div class="field"><label>Note</label><input class="input" id="f_note" placeholder="Optional note" value="${esc(txn && txn.note || '')}"/></div>
  `, `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button>
      <button class="btn btn-primary" id="saveTxn">Save</button>`);

  const typeSel = wrap.querySelector('#f_type');
  const noItemTypes = ['expense', 'payment_in', 'payment_out'];
  typeSel.addEventListener('change', () => {
    const t = typeSel.value;
    const partyField = wrap.querySelector('#partyField');
    const itemField = wrap.querySelector('#itemField');
    itemField.classList.toggle('hidden', noItemTypes.includes(t));
    if (t === 'expense') {
      partyField.innerHTML = `<div class="field"><label>Expense category</label><input class="input" id="f_party" list="expCat" placeholder="e.g. Rent, Salary..." value="${esc(txn && txn.note || '')}"/><datalist id="expCat">${['Rent', 'Salary', 'Electricity', 'Transport', 'Utilities', 'Tea & snacks', 'Maintenance'].map(x => `<option value="${x}">`).join('')}</datalist></div>`;
    } else if (t === 'purchase' || t === 'payment_out') {
      partyField.innerHTML = `<div class="field"><label>Supplier</label><select class="select" id="f_party">${partyOpts(suppliers, txn && txn.party_id)}</select></div>`;
    } else {
      partyField.innerHTML = `<div class="field"><label>Customer</label><select class="select" id="f_party">${partyOpts(customers, txn && txn.party_id)}</select></div>`;
    }
  });

  wrap.querySelector('#saveTxn').addEventListener('click', async () => {
    const body = {
      type: wrap.querySelector('#f_type').value,
      date: wrap.querySelector('#f_date').value || today(),
      amount: Number(wrap.querySelector('#f_amount').value) || 0,
      payment_method: wrap.querySelector('#f_method').value || '',
      note: wrap.querySelector('#f_note').value.trim(),
    };
    const partyEl = wrap.querySelector('#f_party');
    body.party_id = partyEl && partyEl.value ? (isNaN(partyEl.value) ? null : Number(partyEl.value)) : null;
    if (body.type === 'expense' && partyEl && partyEl.value && isNaN(partyEl.value) && !body.note) {
      body.note = partyEl.value.trim();
    }
    const itemEl = wrap.querySelector('#f_item');
    body.item_id = itemEl ? Number(itemEl.value) || null : null;
    body.quantity = Number((wrap.querySelector('#f_qty') || {}).value) || 0;
    body.rate = Number((wrap.querySelector('#f_rate') || {}).value) || 0;
    if (body.type !== 'expense' && body.party_id == null && body.item_id == null) return toast('Select a party or an item', 'error');
    if (body.amount <= 0) return toast('Amount must be greater than zero', 'error');
    try {
      if (editing) await api('/transactions/' + txn.id, { method: 'PUT', body });
      else await api('/transactions', { method: 'POST', body });
      toast(editing ? 'Transaction updated' : 'Transaction added');
      closeModal(wrap);
      await loadRefs();
      route();
    } catch (e) { toast(e.message, 'error'); }
  });
}
window.calcAmt = () => {
  const q = document.getElementById('f_qty'), r = document.getElementById('f_rate'), a = document.getElementById('f_amount');
  if (q && r && a) a.value = (Number(q.value) || 0) * (Number(r.value) || 0);
};
window.manualAmt = () => { /* allow manual override */ };

function addTxn() { txnModal(null); }
async function editTxn(id) {
  const d = await api('/transactions?page=1&limit=1000');
  const t = d.transactions.find(x => x.id === id);
  if (t) txnModal(t);
}
async function delTxn(id) {
  const wrap = openModal('Delete transaction', `<p style="color:var(--text-secondary)">This will permanently remove the transaction. Any affected stock will be restored.</p>`,
    `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-danger" id="cDel">Delete</button>`);
  wrap.querySelector('#cDel').addEventListener('click', async () => {
    try { await api('/transactions/' + id, { method: 'DELETE' }); toast('Transaction deleted'); closeModal(wrap); await loadRefs(); route(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

/* ---------- Parties ---------- */
async function renderParties() {
  setTitle('Parties');
  const tab = state.partyTab || 'all';
  const d = await api('/parties');
  const list = d.parties.filter(p => tab === 'all' || p.type === tab);
  const tabsHtml = [['all', 'All'], ['customer', 'Customers'], ['supplier', 'Suppliers']]
    .map(([v, l]) => `<button class="${tab === v ? 'active' : ''}" onclick="setPartyTab('${v}')">${l}</button>`).join('');

  const cards = list.map(p => `
    <div class="card card-pad" style="display:flex;flex-direction:column;gap:10px;justify-content:space-between">
      <div>
        <div class="row spread">
          <span class="badge ${p.type === 'customer' ? 'badge-info' : 'badge-warning'}">${p.type === 'customer' ? 'Customer' : 'Supplier'}</span>
          <span style="color:var(--text-tertiary);font-size:12px">${esc(p.phone ? '+977 ' + p.phone : '')}</span>
        </div>
        <div style="font-weight:700;font-size:16px;margin-top:8px">${esc(p.name)}</div>
        <div style="color:var(--text-tertiary);font-size:12px">${esc(p.address || '')}</div>
      </div>
      <div>
        <div style="font-size:12px;color:var(--text-secondary)">Balance</div>
        <div class="amount ${p.balance >= 0 ? 'pos' : 'neg'}" style="font-size:18px">${rs(p.balance)}</div>
      </div>
      <div class="row">
        <button class="btn btn-sm" style="flex:1" onclick="viewLedger(${p.id})">Ledger</button>
        <button class="btn btn-sm btn-ghost" onclick="editParty(${p.id})">✎</button>
        <button class="btn btn-sm btn-ghost" onclick="delParty(${p.id})">🗑</button>
      </div>
    </div>`).join('');

  $('view').innerHTML = `
    <div class="row spread">
      <div><div class="page-title">Parties</div><div class="page-sub">${d.parties.length} parties · ${list.length} shown</div></div>
      <button class="btn btn-primary" onclick="addParty()">+ Add party</button>
    </div>
    <div class="toolbar mt-8">
      <div class="seg">${tabsHtml}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px">
      ${cards || '<div class="card empty" style="grid-column:1/-1">No parties yet</div>'}
    </div>`;
}

function setPartyTab(t) { state.partyTab = t; route(); }

function partyModal(p) {
  const editing = !!p;
  const wrap = openModal(editing ? 'Edit party' : 'Add party', `
    <div class="field"><label>Type</label>
      <select class="select" id="p_type"><option value="customer" ${p && p.type === 'customer' ? 'selected' : ''}>Customer</option><option value="supplier" ${p && p.type === 'supplier' ? 'selected' : ''}>Supplier</option></select>
    </div>
    <div class="field"><label>Name *</label><input class="input" id="p_name" value="${esc(p && p.name || '')}" placeholder="e.g. Ram Shrestha, Hari Traders"/></div>
    <div class="row">
      <div class="field" style="flex:1"><label>Phone</label><input class="input" id="p_phone" maxlength="10" value="${esc(p && p.phone || '')}"/></div>
      <div class="field" style="flex:1"><label>Opening balance (Rs.)</label><input class="input" id="p_ob" type="number" step="any" value="${p && p.opening_balance ? p.opening_balance : 0}"/></div>
    </div>
    <div class="field"><label>Address</label><input class="input" id="p_addr" value="${esc(p && p.address || '')}"/></div>
    <div class="field"><label>Email</label><input class="input" id="p_email" value="${esc(p && p.email || '')}"/></div>
    <div class="field"><label>Note</label><input class="input" id="p_note" value="${esc(p && p.note || '')}"/></div>
  `, `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-primary" id="saveParty">Save</button>`);

  wrap.querySelector('#saveParty').addEventListener('click', async () => {
    const body = {
      type: wrap.querySelector('#p_type').value,
      name: wrap.querySelector('#p_name').value.trim(),
      phone: wrap.querySelector('#p_phone').value.replace(/\D/g, ''),
      opening_balance: Number(wrap.querySelector('#p_ob').value) || 0,
      address: wrap.querySelector('#p_addr').value.trim(),
      email: wrap.querySelector('#p_email').value.trim(),
      note: wrap.querySelector('#p_note').value.trim(),
    };
    if (!body.name) return toast('Name is required', 'error');
    try {
      if (editing) await api('/parties/' + p.id, { method: 'PUT', body });
      else await api('/parties', { method: 'POST', body });
      toast(editing ? 'Party updated' : 'Party added');
      closeModal(wrap); await loadRefs(); route();
    } catch (e) { toast(e.message, 'error'); }
  });
}
function addParty() { partyModal(null); }
async function editParty(id) {
  const d = await api('/parties');
  const p = d.parties.find(x => x.id === id);
  if (p) partyModal(p);
}
async function delParty(id) {
  const wrap = openModal('Delete party', `<p style="color:var(--text-secondary)">Deleting a party removes them from your lists. Their transactions will be kept but unlinked.</p>`,
    `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-danger" id="cDelP">Delete</button>`);
  wrap.querySelector('#cDelP').addEventListener('click', async () => {
    try { await api('/parties/' + id, { method: 'DELETE' }); toast('Party deleted'); closeModal(wrap); await loadRefs(); route(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

function viewLedger(id) {
  state.ledgerParty = id;
  state.view = 'ledger';
  route();
}

/* ---------- Ledger ---------- */
async function renderLedger() {
  const id = state.ledgerParty;
  if (!id) { go('parties'); return; }
  const d = await api('/parties/' + id + '/ledger');
  const p = d.party;
  setTitle('Ledger — ' + p.name);
  const meta = { sale: ['Sale', 'success'], purchase: ['Purchase', 'info'], expense: ['Expense', 'danger'], payment_in: ['Received', 'success'], payment_out: ['Paid out', 'warning'] };
  const rows = d.lines.map((l, i) => {
    const m = meta[l.type] || [l.type, 'soft'];
    return `<tr>
      <td>${prettyDate(l.date)}</td>
      <td><span class="badge badge-${m[1]}">${m[0]}</span></td>
      <td>${esc(l.item_name || l.note || '')}</td>
      <td class="amount ${['sale', 'purchase'].includes(l.type) ? 'pos' : ''}">${['sale', 'purchase'].includes(l.type) ? rs(l.amount) : '—'}</td>
      <td class="amount ${['payment_in', 'payment_out'].includes(l.type) ? '' : 'neg'}">${['payment_in', 'payment_out'].includes(l.type) ? rs(l.amount) : '—'}</td>
      <td class="amount">${rs(l.balance)}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="delTxn(${l.id})">🗑</button></td>
    </tr>`;
  }).join('');

  $('view').innerHTML = `
    <div class="row spread">
      <div class="row">
        <button class="btn btn-sm" onclick="go('parties')">← Parties</button>
        <div class="avatar-lg">${esc(p.name[0] || '?')}</div>
        <div>
          <div class="page-title">${esc(p.name)}</div>
          <div class="page-sub">${p.type === 'customer' ? 'Customer' : 'Supplier'} · +977 ${esc(p.phone || '—')}${p.address ? ' · ' + esc(p.address) : ''}</div>
        </div>
      </div>
      <button class="btn btn-primary" onclick="addTxnForParty(${p.id}, '${p.type}')">+ Record transaction</button>
    </div>
    <div class="card card-pad" style="background:linear-gradient(135deg,#6359e0,#8b7cf6);color:#fff;border:none">
      <div class="row spread">
        <div>
          <div style="font-size:13px;opacity:.8">Closing balance</div>
          <div style="font-size:28px;font-weight:800">${rs(d.closing)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;opacity:.8">Opening balance</div>
          <div style="font-size:18px;font-weight:700">${rs(p.opening_balance)}</div>
        </div>
      </div>
    </div>
    <div class="card card-pad mt-16">
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Type</th><th>Details</th><th>In (Rs.)</th><th>Out (Rs.)</th><th>Balance</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7"><div class="empty">No transactions yet</div></td></tr>'}</tbody>
      </table></div>
    </div>`;
}

function addTxnForParty(pid, ptype) {
  const fake = { type: ptype === 'supplier' ? 'purchase' : 'sale', party_id: pid };
  txnModal(fake);
}

/* ---------- Items ---------- */
async function renderItems() {
  setTitle('Inventory');
  const d = await api('/items');
  const rows = d.items.map(i => `
    <tr>
      <td style="font-weight:600">${esc(i.name)}</td>
      <td>${esc(i.unit)}</td>
      <td class="amount">${rs(i.purchase_price)}</td>
      <td class="amount">${rs(i.sale_price)}</td>
      <td>
        <span class="amount">${fmt(i.stock)}</span>
        ${i.low_stock > 0 && i.stock <= i.low_stock ? ` <span class="badge badge-danger">Low</span>` : ''}
      </td>
      <td>
        <button class="btn btn-sm" onclick="editItem(${i.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="delItem(${i.id})">Delete</button>
      </td>
    </tr>`).join('');

  $('view').innerHTML = `
    <div class="row spread">
      <div><div class="page-title">Inventory</div><div class="page-sub">${d.items.length} items · stock updates automatically from transactions</div></div>
      <button class="btn btn-primary" onclick="addItem()">+ Add item</button>
    </div>
    <div class="card card-pad mt-8">
      <div class="table-wrap"><table>
        <thead><tr><th>Item</th><th>Unit</th><th>Buy price</th><th>Sell price</th><th>Stock</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6"><div class="empty">No items yet. Add your products to track inventory.</div></td></tr>'}</tbody>
      </table></div>
    </div>`;
}

function itemModal(it) {
  const editing = !!it;
  const wrap = openModal(editing ? 'Edit item' : 'Add item', `
    <div class="field"><label>Item name *</label><input class="input" id="i_name" value="${esc(it && it.name || '')}" placeholder="e.g. Coca-Cola 1L"/></div>
    <div class="row">
      <div class="field" style="flex:1"><label>Unit</label>
        <select class="select" id="i_unit"><option ${it && it.unit === 'pcs' ? 'selected' : ''}>pcs</option><option ${it && it.unit === 'kg' ? 'selected' : ''}>kg</option><option ${it && it.unit === 'liter' ? 'selected' : ''}>liter</option><option ${it && it.unit === 'box' ? 'selected' : ''}>box</option><option ${it && it.unit === 'dozen' ? 'selected' : ''}>dozen</option><option ${it && it.unit === 'pack' ? 'selected' : ''}>pack</option></select>
      </div>
      <div class="field" style="flex:1"><label>Stock on hand</label><input class="input" id="i_stock" type="number" step="any" value="${it ? it.stock : 0}"/></div>
    </div>
    <div class="row">
      <div class="field" style="flex:1"><label>Buy price (Rs.)</label><input class="input" id="i_bp" type="number" step="any" value="${it ? it.purchase_price : 0}"/></div>
      <div class="field" style="flex:1"><label>Sell price (Rs.)</label><input class="input" id="i_sp" type="number" step="any" value="${it ? it.sale_price : 0}"/></div>
    </div>
    <div class="field"><label>Low stock alert at</label><input class="input" id="i_low" type="number" step="any" value="${it ? it.low_stock : 0}"/><div class="hint">You'll see a warning when stock drops to this level (0 = off)</div></div>
  `, `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-primary" id="saveItem">Save</button>`);

  wrap.querySelector('#saveItem').addEventListener('click', async () => {
    const body = {
      name: wrap.querySelector('#i_name').value.trim(),
      unit: wrap.querySelector('#i_unit').value,
      stock: Number(wrap.querySelector('#i_stock').value) || 0,
      purchase_price: Number(wrap.querySelector('#i_bp').value) || 0,
      sale_price: Number(wrap.querySelector('#i_sp').value) || 0,
      low_stock: Number(wrap.querySelector('#i_low').value) || 0,
    };
    if (!body.name) return toast('Item name is required', 'error');
    try {
      if (editing) await api('/items/' + it.id, { method: 'PUT', body });
      else await api('/items', { method: 'POST', body });
      toast(editing ? 'Item updated' : 'Item added');
      closeModal(wrap); await loadRefs(); route();
    } catch (e) { toast(e.message, 'error'); }
  });
}
function addItem() { itemModal(null); }
async function editItem(id) {
  const d = await api('/items');
  const it = d.items.find(x => x.id === id);
  if (it) itemModal(it);
}
async function delItem(id) {
  const wrap = openModal('Delete item', `<p style="color:var(--text-secondary)">This removes the item from inventory. Past transactions will be kept but unlinked.</p>`,
    `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-danger" id="cDelI">Delete</button>`);
  wrap.querySelector('#cDelI').addEventListener('click', async () => {
    try { await api('/items/' + id, { method: 'DELETE' }); toast('Item deleted'); closeModal(wrap); await loadRefs(); route(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

/* ---------- Reports ---------- */
async function renderReports() {
  setTitle('Reports');
  const range = state.reportRange;
  let from = '', to = today();
  if (range === 'today') from = today();
  else if (range === 'week') from = rangeDays(7);
  else if (range === 'month') from = rangeDays(30);
  else if (range === 'all') from = '';

  const d = await api('/reports?' + new URLSearchParams({ from, to }).toString());
  const seg = [['today', 'Today'], ['week', '7 days'], ['month', '30 days'], ['all', 'All time']]
    .map(([v, l]) => `<button class="${range === v ? 'active' : ''}" onclick="setReportRange('${v}')">${l}</button>`).join('');

  const period = range === 'all' ? 'All time' : (range === 'today' ? 'Today' : 'Last ' + (range === 'week' ? '7' : '30') + ' days');
  const profitPct = d.byType.sale ? Math.round((d.profit / d.byType.sale) * 100) : 0;

  const topItemsHtml = (d.topItems || []).map((r, i) => `
    <div class="row" style="margin:10px 0">
      <span style="width:24px;color:var(--text-tertiary);font-weight:700">${i + 1}</span>
      <div style="flex:1">
        <div style="font-weight:600">${esc(r.name)}</div>
        <div class="hint" style="color:var(--text-tertiary);font-size:12px">${fmt(r.qty)} sold</div>
      </div>
      <span class="amount">${rs(r.amt)}</span>
    </div>`).join('') || '<div class="empty">No sales in this period</div>';

  const topCustHtml = (d.topCustomers || []).map((r, i) => `
    <div class="row" style="margin:10px 0">
      <span style="width:24px;color:var(--text-tertiary);font-weight:700">${i + 1}</span>
      <div style="flex:1;font-weight:600">${esc(r.name)}</div>
      <span class="amount">${rs(r.amt)}</span>
    </div>`).join('') || '<div class="empty">No data</div>';

  const expHtml = (d.expenseByNote || []).map(r => `
    <div class="row" style="margin:10px 0">
      <div style="flex:1;font-weight:600">${esc(r.name)}</div>
      <span class="amount neg">${rs(r.amt)}</span>
    </div>`).join('') || '<div class="empty">No expenses in this period</div>';

  $('view').innerHTML = `
    <div class="row spread">
      <div><div class="page-title">Business reports</div><div class="page-sub">Performance for ${period}${from ? ' · from ' + prettyDate(from) : ''}</div></div>
      <div class="seg">${seg}</div>
    </div>
    <div class="stats mt-8">
      <div class="stat sale"><div class="s-label">Total sales</div><div class="s-value pos">${rs(d.byType.sale)}</div></div>
      <div class="stat purchase"><div class="s-label">Total purchases</div><div class="s-value">${rs(d.byType.purchase)}</div></div>
      <div class="stat expense"><div class="s-label">Total expenses</div><div class="s-value neg">${rs(d.byType.expense)}</div></div>
      <div class="stat profit"><div class="s-label">Profit / Loss</div><div class="s-value ${d.profit >= 0 ? 'pos' : 'neg'}">${rs(d.profit)}</div><div class="s-note">${d.byType.sale ? profitPct + '% margin' : ''}</div></div>
    </div>
    <div class="grid-2 mt-16">
      <div class="card card-pad"><h3 class="mb-16">Top selling items</h3>${topItemsHtml}</div>
      <div class="card card-pad"><h3 class="mb-16">Top customers</h3>${topCustHtml}</div>
    </div>
    <div class="grid-2 mt-16">
      <div class="card card-pad"><h3 class="mb-16">Expense breakdown</h3>${expHtml}</div>
      <div class="card card-pad"><h3 class="mb-16">Payment methods</h3>${'<div class="empty">Available soon</div>'}</div>
    </div>`;
}
function setReportRange(r) { state.reportRange = r; route(); }

/* ---------- Staff ---------- */
async function renderStaff() {
  setTitle('Staff');
  const d = await api('/staff');
  const rows = d.staff.map(u => `
    <tr>
      <td style="font-weight:600">${esc(u.name)}${u.is_owner ? ' <span class="badge badge-primary">Owner</span>' : ''}</td>
      <td>+977 ${esc(u.phone)}</td>
      <td><span class="badge ${u.is_owner ? 'badge-primary' : 'badge-soft'}">${esc(u.role)}</span></td>
      <td>${u.is_owner ? '—' : `<button class="btn btn-sm btn-danger" onclick="delStaff(${u.id})">Remove</button>`}</td>
    </tr>`).join('');

  $('view').innerHTML = `
    <div class="row spread">
      <div><div class="page-title">Staff</div><div class="page-sub">Add your staff so they can help manage the business</div></div>
      <button class="btn btn-primary" onclick="addStaff()">+ Add staff</button>
    </div>
    <div class="card card-pad mt-8">
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Role</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    </div>`;
}

function addStaff() {
  const wrap = openModal('Add staff member', `
    <div class="field"><label>Name</label><input class="input" id="s_name" placeholder="e.g. Sita Sharma"/></div>
    <div class="field"><label>Phone (for login)</label><input class="input" id="s_phone" maxlength="10" placeholder="98XXXXXXXX"/></div>
    <div class="field"><label>Role</label>
      <select class="select" id="s_role"><option value="staff">Staff</option><option value="manager">Manager</option><option value="accountant">Accountant</option></select>
    </div>
  `, `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-primary" id="saveStaff">Add</button>`);
  wrap.querySelector('#saveStaff').addEventListener('click', async () => {
    const body = { name: wrap.querySelector('#s_name').value.trim(), phone: wrap.querySelector('#s_phone').value.replace(/\D/g, ''), role: wrap.querySelector('#s_role').value };
    if (!body.name) return toast('Name is required', 'error');
    try { await api('/staff', { method: 'POST', body }); toast('Staff added'); closeModal(wrap); route(); }
    catch (e) { toast(e.message, 'error'); }
  });
}
async function delStaff(id) {
  const wrap = openModal('Remove staff', `<p style="color:var(--text-secondary)">This staff member will no longer be able to log in to this business.</p>`,
    `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-danger" id="cDelS">Remove</button>`);
  wrap.querySelector('#cDelS').addEventListener('click', async () => {
    try { await api('/staff/' + id, { method: 'DELETE' }); toast('Staff removed'); closeModal(wrap); route(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

/* ---------- Settings ---------- */
async function renderSettings() {
  setTitle('Settings');
  const b = state.business;
  $('view').innerHTML = `
    <div class="page-title">Settings</div>
    <div class="page-sub">Manage your business profile and data</div>
    <div class="grid-2">
      <div class="card card-pad">
        <h3 class="mb-16">Business profile</h3>
        <div class="field"><label>Business name *</label><input class="input" id="b_name" value="${esc(b.name)}"/></div>
        <div class="row">
          <div class="field" style="flex:1"><label>Owner name</label><input class="input" id="b_owner" value="${esc(b.owner_name)}"/></div>
          <div class="field" style="flex:1"><label>Phone</label><input class="input" id="b_phone" value="${esc(b.phone)}"/></div>
        </div>
        <div class="field"><label>Address</label><input class="input" id="b_addr" value="${esc(b.address)}"/></div>
        <div class="row">
          <div class="field" style="flex:1"><label>Currency</label>
            <select class="select" id="b_cur"><option value="NPR" ${b.currency === 'NPR' ? 'selected' : ''}>NPR (रु)</option><option value="USD" ${b.currency === 'USD' ? 'selected' : ''}>USD ($)</option><option value="INR" ${b.currency === 'INR' ? 'selected' : ''}>INR (₹)</option></select>
          </div>
          <div class="field" style="flex:1"><label>Fiscal year starts</label><input class="input" id="b_fy" type="date" value="${esc(b.fiscal_year_start)}"/></div>
        </div>
        <button class="btn btn-primary" onclick="saveBusiness()">Save changes</button>
      </div>
      <div>
        <div class="card card-pad mb-16">
          <h3 class="mb-16">Backup & restore</h3>
          <p style="color:var(--text-secondary);margin-bottom:14px">Export all your data as a JSON file, or restore from a previous backup.</p>
          <div class="row">
            <button class="btn" onclick="exportData()">⬇ Export backup</button>
            <button class="btn" onclick="document.getElementById('importFile').click()">⬆ Restore backup</button>
            <input type="file" id="importFile" accept=".json" class="hidden"/>
          </div>
        </div>
        <div class="card card-pad" style="border-color:#f3c5c7">
          <h3 class="mb-16" style="color:var(--danger)">Danger zone</h3>
          <p style="color:var(--text-secondary);margin-bottom:14px">Delete all transactions, parties and items. This cannot be undone.</p>
          <button class="btn btn-danger" onclick="resetData()">Reset business data</button>
        </div>
      </div>
    </div>`;

  $('importFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        await api('/import', { method: 'POST', body: data });
        toast('Backup restored');
        state.business = (await api('/me')).business;
        await loadRefs(); route();
      } catch (err) { toast(err.message, 'error'); }
    };
    reader.readAsText(f);
  });
}

async function saveBusiness() {
  const body = {
    name: $('b_name').value.trim(),
    owner_name: $('b_owner').value.trim(),
    phone: $('b_phone').value,
    address: $('b_addr').value.trim(),
    currency: $('b_cur').value,
    fiscal_year_start: $('b_fy').value,
  };
  if (!body.name) return toast('Business name is required', 'error');
  try {
    const j = await api('/business', { method: 'PUT', body });
    state.business = j.business;
    $('brandSub').textContent = j.business.name;
    toast('Settings saved');
    route();
  } catch (e) { toast(e.message, 'error'); }
}

async function exportData() {
  const j = await api('/export');
  const blob = new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'len-den-backup-' + today() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Backup downloaded');
}

function resetData() {
  const wrap = openModal('Reset business data', `<p style="color:var(--text-secondary)">Type <b>RESET</b> to confirm you want to delete all your business data.</p>
    <div class="field mt-8"><input class="input" id="resetConfirm" placeholder="RESET"/></div>`,
    `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-danger" id="doReset" disabled>Reset everything</button>`);
  wrap.querySelector('#resetConfirm').addEventListener('input', e => {
    wrap.querySelector('#doReset').disabled = e.target.value !== 'RESET';
  });
  wrap.querySelector('#doReset').addEventListener('click', async () => {
    try {
      await api('/import', { method: 'POST', body: { app: 'len-den', parties: [], items: [], transactions: [] } });
      toast('Business data reset');
      closeModal(wrap); await loadRefs(); route();
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* ---------- global exposure ---------- */
window.go = go;
window.setTxnType = setTxnType;
window.setTxnParty = setTxnParty;
window.setTxnItem = setTxnItem;
window.setTxnFrom = setTxnFrom;
window.setTxnTo = setTxnTo;
window.resetTxnFilter = resetTxnFilter;
window.pageTxn = pageTxn;
window.addTxn = addTxn;
window.editTxn = editTxn;
window.delTxn = delTxn;
window.setPartyTab = setPartyTab;
window.addParty = addParty;
window.editParty = editParty;
window.delParty = delParty;
window.viewLedger = viewLedger;
window.addTxnForParty = addTxnForParty;
window.addItem = addItem;
window.editItem = editItem;
window.delItem = delItem;
window.setReportRange = setReportRange;
window.addStaff = addStaff;
window.delStaff = delStaff;
window.saveBusiness = saveBusiness;
window.exportData = exportData;
window.resetData = resetData;
window.closeModal = closeModal;

boot();

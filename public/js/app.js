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
  partyTab: 'all',
  partyCat: '',
  partyQ: '',
  itemCat: '',
  daybookDate: today(),
  dark: localStorage.getItem('lenden_dark') === '1',
  fontSize: Number(localStorage.getItem('lenden_font')) || 16,
};

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const TX_VIEWS = ['khata', 'sales', 'purchase', 'expense', 'other_income'];

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
  applyAppearance();
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
      if (TX_VIEWS.includes(state.view)) route();
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
  $('globalSearchWrap').classList.toggle('hidden', !TX_VIEWS.includes(v));
  try {
    if (v === 'dashboard') await renderDashboard();
    else if (v === 'khata') await renderKhata();
    else if (v === 'sales') await renderTypeView({ type: 'sale', title: 'Sales', label: 'Sale', partyType: 'customer', badge: ['Sale', 'success'] });
    else if (v === 'purchase') await renderTypeView({ type: 'purchase', title: 'Purchases', label: 'Purchase', partyType: 'supplier', badge: ['Purchase', 'info'] });
    else if (v === 'expense') await renderTypeView({ type: 'expense', title: 'Expenses', label: 'Expense', badge: ['Expense', 'danger'] });
    else if (v === 'other_income') await renderTypeView({ type: 'other_income', title: 'Other Income', label: 'Income', badge: ['Other income', 'success'] });
    else if (v === 'accounts') await renderAccounts();
    else if (v === 'parties') await renderParties();
    else if (v === 'ledger') await renderLedger();
    else if (v === 'items') await renderItems();
    else if (v === 'reports') await renderReports();
    else if (v === 'staff') await renderStaff();
    else if (v === 'import') await renderImport();
    else if (v === 'refer') await renderRefer();
    else if (v === 'help') await renderHelp();
    else if (v === 'tutorials') await renderTutorials();
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
  const income = s.sale + s.payment_in + s.other_income;
  const outcome = s.purchase + s.expense + s.payment_out;
  const net = income - outcome;
  const txnTypes = { sale: ['Sale', 'success'], purchase: ['Purchase', 'info'], expense: ['Expense', 'danger'], other_income: ['Other income', 'success'], payment_in: ['Received', 'success'], payment_out: ['Paid out', 'warning'] };

  const recentHtml = d.recent.length ? d.recent.map(t => {
    const meta = txnTypes[t.type] || [t.type, 'soft'];
    const amtCls = ['sale', 'payment_in', 'other_income'].includes(t.type) ? 'pos' : 'neg';
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

  const day = await api('/daybook?date=' + (state.daybookDate || today()));
  const dayRows = day.transactions.length ? day.transactions.map(t => {
    const meta = txnTypes[t.type] || [t.type, 'soft'];
    return `<tr>
      <td><span class="badge badge-${meta[1]}">${meta[0]}</span></td>
      <td>${esc(t.party_name || t.item_name || t.note || '—')}</td>
      <td class="amount ${['sale', 'payment_in', 'other_income'].includes(t.type) ? 'pos' : 'neg'}">${rs(t.amount)}</td>
      <td style="color:var(--text-tertiary);font-size:12px">${esc(t.ref_no || '')}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="4"><div class="empty">Nothing recorded on this day</div></td></tr>';

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
    </div>
    <div class="grid-2 mt-16">
      <div class="card card-pad">
        <div class="row spread mb-16"><h3>Daybook</h3><input type="date" class="input" style="width:160px" value="${state.daybookDate || today()}" onchange="setDaybookDate(this.value)"/></div>
        <div class="stats mt-8">
          <div class="stat recv" style="border:none;box-shadow:none"><div class="s-label">Money in</div><div class="s-value pos" style="font-size:18px">${rs(day.inflow)}</div></div>
          <div class="stat pay" style="border:none;box-shadow:none"><div class="s-label">Money out</div><div class="s-value neg" style="font-size:18px">${rs(day.outflow)}</div></div>
        </div>
        <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Type</th><th>Details</th><th>Amount</th><th>Ref</th></tr></thead><tbody>${dayRows}</tbody></table></div>
      </div>
      <div class="card card-pad">
        <h3 class="mb-16">Quick tools</h3>
        <button class="btn btn-block mb-16" onclick="emiModal()">📱 EMI calculator</button>
        <button class="btn btn-block mb-16" onclick="go('reports')">📈 View reports</button>
        <button class="btn btn-block" onclick="go('tutorials')">📘 Tutorials</button>
      </div>
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

function setDaybookDate(d) { state.daybookDate = d || today(); route(); }

/* ---------- Khata / Transactions ---------- */
async function renderKhata() {
  setTitle('Transactions');
  const f = state.txnFilter;
  const q = new URLSearchParams({ type: f.type, party_id: f.party_id, item_id: f.item_id, from: f.from, to: f.to, q: f.q, page: state.txnPage, limit: 25 }).toString();
  const d = await api('/transactions?' + q);
  const txnTypes = { sale: ['Sale', 'success'], purchase: ['Purchase', 'info'], expense: ['Expense', 'danger'], other_income: ['Other income', 'success'], payment_in: ['Received', 'success'], payment_out: ['Paid out', 'warning'] };

  const tabs = [['', 'All'], ['sale', 'Sales'], ['purchase', 'Purchases'], ['expense', 'Expenses'], ['other_income', 'Other Income'], ['payment_in', 'Received'], ['payment_out', 'Paid out']]
    .map(([v, l]) => `<button class="${f.type === v ? 'active' : ''}" onclick="setTxnType('${v}')">${l}</button>`).join('');

  const rows = d.transactions.map(t => {
    const meta = txnTypes[t.type] || [t.type, 'soft'];
    const amtCls = ['sale', 'payment_in', 'other_income'].includes(t.type) ? 'pos' : 'neg';
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
  const editing = !!txn && !!txn.id;
  const defType = txn ? txn.type : 'sale';
  const customers = state.parties.filter(p => p.type === 'customer');
  const suppliers = state.parties.filter(p => p.type === 'supplier');
  const partyOpts = (list, sel) => `<option value="">— Select —</option>` + list.map(p => `<option value="${p.id}" ${Number(sel) === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const itemOpts = `<option value="">— None —</option>` + state.items.map(i => `<option value="${i.id}" ${Number(txn && txn.item_id) === i.id ? 'selected' : ''}>${esc(i.name)} (${fmt(i.stock)} ${i.unit} in stock)</option>`).join('');
  const types = [['sale', 'Sale (khata baki)'], ['purchase', 'Purchase'], ['expense', 'Expense'], ['other_income', 'Other Income'], ['payment_in', 'Payment received'], ['payment_out', 'Payment made']];
  const noItemTypes = ['expense', 'other_income', 'payment_in', 'payment_out'];

  let partyFieldHtml;
  if (defType === 'expense') {
    partyFieldHtml = `<div class="field"><label>Expense category</label><input class="input" id="f_party" list="expCat" placeholder="e.g. Rent, Salary..." value="${esc(txn && txn.note || '')}"/><datalist id="expCat">${['Rent', 'Salary', 'Electricity', 'Transport', 'Utilities', 'Tea & snacks', 'Maintenance'].map(x => `<option value="${x}">`).join('')}</datalist></div>`;
  } else if (defType === 'other_income') {
    partyFieldHtml = `<div class="field"><label>Income category</label><input class="input" id="f_party" list="incCat" placeholder="e.g. Interest, Commission..." value="${esc(txn && txn.note || '')}"/><datalist id="incCat">${['Interest', 'Commission', 'Rent received', 'Discount received', 'Sale of assets', 'Other'].map(x => `<option value="${x}">`).join('')}</datalist></div>`;
  } else if (defType === 'purchase' || defType === 'payment_out') {
    partyFieldHtml = `<div class="field"><label>Supplier</label><select class="select" id="f_party">${partyOpts(suppliers, txn && txn.party_id)}</select></div>`;
  } else {
    partyFieldHtml = `<div class="field"><label>Customer</label><select class="select" id="f_party">${partyOpts(customers, txn && txn.party_id)}</select></div>`;
  }

  const rateHint = (txn && txn.rate) ? ` · rate ${rs(txn.rate)}` : '';
  const wrap = openModal(editing ? 'Edit transaction' : 'Add transaction', `
    ${txn && txn.ref_no ? `<div class="field"><label>Reference no.</label><input class="input" value="${esc(txn.ref_no)}" disabled/></div>` : ''}
    <div class="field"><label>Transaction type</label>
      <select class="select" id="f_type">${types.map(([v, l]) => `<option value="${v}" ${defType === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div id="partyField">${partyFieldHtml}</div>
    <div id="itemField" class="${noItemTypes.includes(defType) ? 'hidden' : ''}">
      <div class="field"><label>Item</label><select class="select" id="f_item">${itemOpts}</select></div>
      <div class="row">
        <div class="field" style="flex:1"><label>Quantity</label><input class="input" id="f_qty" type="number" min="0" step="any" value="${txn && txn.quantity ? txn.quantity : 1}" oninput="calcAmt()"/></div>
        <div class="field" style="flex:1"><label>Rate${txn && txn.rate ? rateHint : ''}</label><input class="input" id="f_rate" type="number" min="0" step="any" value="${txn && txn.rate ? txn.rate : ''}" oninput="calcAmt()"/></div>
      </div>
      <div class="hint" id="priceHint" style="color:var(--text-tertiary);font-size:12px;margin-bottom:10px"></div>
    </div>
    <div class="field"><label>Amount (Rs.)</label><input class="input" id="f_amount" type="number" min="0" step="any" value="${txn ? txn.amount : ''}" oninput="manualAmt()"/></div>
    <div id="discVatRow" class="row ${noItemTypes.includes(defType) ? 'hidden' : ''}">
      <div class="field" style="flex:1"><label>Discount (Rs.)</label><input class="input" id="f_discount" type="number" min="0" step="any" value="${txn && txn.discount ? txn.discount : 0}"/></div>
      <div class="field" style="flex:1"><label>VAT (%)</label><input class="input" id="f_vat" type="number" min="0" step="any" value="${txn && txn.vat_percent ? txn.vat_percent : 0}"/></div>
    </div>
    <div class="row">
      <div class="field" style="flex:1"><label>Date</label><input class="input" id="f_date" type="date" value="${txn ? txn.date : today()}"/></div>
      <div class="field" style="flex:1"><label>Payment method</label>
        <select class="select" id="f_method"><option value="">Cash</option><option ${txn && txn.payment_method === 'Bank' ? 'selected' : ''}>Bank</option><option ${txn && txn.payment_method === 'Khalti' ? 'selected' : ''}>Khalti</option><option ${txn && txn.payment_method === 'eSewa' ? 'selected' : ''}>eSewa</option><option ${txn && txn.payment_method === 'Mobile Banking' ? 'selected' : ''}>Mobile Banking</option><option ${txn && txn.payment_method === 'Cheque' ? 'selected' : ''}>Cheque</option></select>
      </div>
    </div>
    <div class="field"><label>Reminder / due date</label><input class="input" id="f_reminder" type="date" value="${txn && txn.reminder_date ? txn.reminder_date : ''}"/><div class="hint" style="color:var(--text-tertiary);font-size:12px">Set a due date for this khata entry — you can send a WhatsApp reminder from the ledger.</div></div>
    <div class="field"><label>Note</label><input class="input" id="f_note" placeholder="Optional note" value="${esc(txn && txn.note || '')}"/></div>
  `, `${editing ? `<button class="btn" onclick="viewInvoice(${txn.id})">🧾 Invoice</button>` : ''}<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button>
      <button class="btn btn-primary" id="saveTxn">Save</button>`);

  const typeSel = wrap.querySelector('#f_type');
  typeSel.addEventListener('change', () => {
    const t = typeSel.value;
    const partyField = wrap.querySelector('#partyField');
    const itemField = wrap.querySelector('#itemField');
    itemField.classList.toggle('hidden', noItemTypes.includes(t));
    wrap.querySelector('#discVatRow').classList.toggle('hidden', noItemTypes.includes(t));
    if (t === 'expense') {
      partyField.innerHTML = `<div class="field"><label>Expense category</label><input class="input" id="f_party" list="expCat" placeholder="e.g. Rent, Salary..." value="${esc(txn && txn.note || '')}"/><datalist id="expCat">${['Rent', 'Salary', 'Electricity', 'Transport', 'Utilities', 'Tea & snacks', 'Maintenance'].map(x => `<option value="${x}">`).join('')}</datalist></div>`;
    } else if (t === 'other_income') {
      partyField.innerHTML = `<div class="field"><label>Income category</label><input class="input" id="f_party" list="incCat" placeholder="e.g. Interest, Commission..." value="${esc(txn && txn.note || '')}"/><datalist id="incCat">${['Interest', 'Commission', 'Rent received', 'Discount received', 'Sale of assets', 'Other'].map(x => `<option value="${x}">`).join('')}</datalist></div>`;
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
      discount: Number(wrap.querySelector('#f_discount').value) || 0,
      vat_percent: Number(wrap.querySelector('#f_vat').value) || 0,
      reminder_date: (wrap.querySelector('#f_reminder') || {}).value || '',
      payment_method: wrap.querySelector('#f_method').value || '',
      note: wrap.querySelector('#f_note').value.trim(),
    };
    const partyEl = wrap.querySelector('#f_party');
    body.party_id = partyEl && partyEl.value ? (isNaN(partyEl.value) ? null : Number(partyEl.value)) : null;
    if (['expense', 'other_income'].includes(body.type) && partyEl && partyEl.value && isNaN(partyEl.value) && !body.note) {
      body.note = partyEl.value.trim();
    }
    const itemEl = wrap.querySelector('#f_item');
    body.item_id = itemEl ? Number(itemEl.value) || null : null;
    body.quantity = Number((wrap.querySelector('#f_qty') || {}).value) || 0;
    body.rate = Number((wrap.querySelector('#f_rate') || {}).value) || 0;
    if (!['expense', 'other_income'].includes(body.type) && body.party_id == null && body.item_id == null) return toast('Select a party or an item', 'error');
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

  const itemSel = wrap.querySelector('#f_item');
  if (itemSel) {
    itemSel.addEventListener('change', () => {
      const it = state.items.find(x => x.id === Number(itemSel.value));
      const hint = wrap.querySelector('#priceHint');
      const typeNow = wrap.querySelector('#f_type').value;
      if (it && hint) {
        hint.textContent = `Buy ${rs(it.purchase_price)} · Sell ${rs(it.sale_price)} · Wholesale ${rs(it.wholesale_price)} · MRP ${rs(it.mrp)} · ${fmt(it.stock)} ${it.unit} in stock`;
        const rateEl = wrap.querySelector('#f_rate');
        if (rateEl && !Number(rateEl.value)) {
          const suggested = typeNow === 'purchase' ? (it.wholesale_price || it.purchase_price) : (it.wholesale_price || it.sale_price);
          rateEl.value = suggested || '';
          calcAmt();
        }
      } else if (hint) hint.textContent = '';
    });
  }
}
window.calcAmt = () => {
  const q = document.getElementById('f_qty'), r = document.getElementById('f_rate'), a = document.getElementById('f_amount');
  if (q && r && a) a.value = (Number(q.value) || 0) * (Number(r.value) || 0);
};
window.manualAmt = () => { /* allow manual override */ };

function addTxn() { txnModal(null); }
function addTxnOfType(type) { txnModal({ type: type }); }
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

async function viewInvoice(id) {
  const d = await api('/transactions/' + id);
  const t = d.transaction;
  const b = d.business;
  const lines = [];
  if (t.item_name) lines.push([t.item_name, fmt(t.quantity) + ' ' + t.item_unit, rs(t.rate), rs(t.amount)]);
  else if (t.party_name) lines.push([(t.note || 'Khata entry'), '', '', rs(t.amount)]);
  else lines.push([t.note || 'Entry', '', '', rs(t.amount)]);
  const subtotal = Number(t.amount) + Number(t.discount);
  const wrap = openModal('Invoice ' + esc(t.ref_no || ''), `
    <div id="invoicePrint" style="max-width:380px;margin:0 auto;padding:10px;font-size:14px;color:#000">
      <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px">
        <div style="font-size:20px;font-weight:800">${esc(b.name)}</div>
        <div style="font-size:12px">${esc(b.address || '')}</div>
        <div style="font-size:12px">Tel: ${esc(b.phone || '—')}${b.owner_name ? ' · ' + esc(b.owner_name) : ''}</div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:8px">
        <div>Invoice: <b>${esc(t.ref_no || '—')}</b></div>
        <div>Date: <b>${prettyDate(t.date)}</b></div>
      </div>
      <div style="font-size:12px;margin-top:4px">${t.party_name ? 'Bill to: <b>' + esc(t.party_name) + '</b>' + (t.party_phone ? ' · +977 ' + esc(t.party_phone) : '') : ''}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px">
        <thead><tr style="border-bottom:1px solid #000"><th style="text-align:left">Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${lines.map(l => `<tr><td>${l[0]}</td><td style="text-align:right">${l[1]}</td><td style="text-align:right">${l[2]}</td><td style="text-align:right">${l[3]}</td></tr>`).join('')}</tbody>
      </table>
      <div style="margin-top:8px;font-size:12px">
        <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${rs(subtotal)}</span></div>
        ${t.discount ? `<div style="display:flex;justify-content:space-between"><span>Discount</span><span>- ${rs(t.discount)}</span></div>` : ''}
        ${t.vat_percent ? `<div style="display:flex;justify-content:space-between"><span>VAT ${fmt(t.vat_percent)}%</span><span>${rs(t.amount * t.vat_percent / 100)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:14px;border-top:1px solid #000;margin-top:4px;padding-top:4px"><span>Total</span><span>${rs(t.amount)}</span></div>
        ${t.payment_method ? `<div style="display:flex;justify-content:space-between"><span>Payment</span><span>${esc(t.payment_method)}</span></div>` : ''}
        ${t.reminder_date ? `<div style="display:flex;justify-content:space-between"><span>Due date</span><span>${prettyDate(t.reminder_date)}</span></div>` : ''}
      </div>
      ${t.note ? `<div style="font-size:11px;margin-top:8px">Note: ${esc(t.note)}</div>` : ''}
      <div style="text-align:center;font-size:11px;margin-top:12px;border-top:1px dashed #000;padding-top:6px">Thank you!</div>
    </div>`,
    `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Close</button><button class="btn btn-primary" onclick="printInvoice()">🖨 Print / Save PDF</button>`);
  window.__printSource = wrap.querySelector('#invoicePrint').cloneNode(true);
}
window.printInvoice = () => {
  const src = window.__printSource;
  if (!src) return;
  const w = window.open('', '_blank', 'width=480,height=700');
  w.document.write('<!doctype html><html><head><title>Invoice</title><style>body{font-family:Arial,sans-serif;margin:24px}#invoicePrint{max-width:380px;margin:0 auto}</style></head><body>');
  w.document.write(src.outerHTML);
  w.document.write('<script>window.onload=function(){window.print();setTimeout(function(){window.close();},800);}<\/script></body></html>');
  w.document.close();
};

/* ---------- Sales / Purchase / Expense / Other Income ---------- */
async function renderTypeView(cfg) {
  setTitle(cfg.title);
  const f = state.txnFilter;
  const q = new URLSearchParams({ type: cfg.type, party_id: f.party_id, item_id: f.item_id, from: f.from, to: f.to, q: f.q, page: state.txnPage, limit: 25 }).toString();
  const d = await api('/transactions?' + q);
  const meta = cfg.badge || [cfg.label || cfg.type, 'soft'];
  const isIn = cfg.type === 'sale' || cfg.type === 'other_income';

  const overdue = t => t.reminder_date && t.reminder_date < today() && ['sale', 'purchase'].includes(t.type) && t.type !== 'payment_in' && t.type !== 'payment_out';
  const rows = d.transactions.map(t => `
    <tr>
      <td>${prettyDate(t.date)}</td>
      <td><b>${esc(t.party_name || t.item_name || (t.note || '—'))}</b><div class="hint" style="color:var(--text-tertiary);font-size:11px">${esc(t.ref_no || '')}${t.item_name ? ' · ' + esc(t.item_name) : ''}</div>${t.reminder_date ? ` <span class="badge ${t.reminder_date < today() ? 'badge-danger' : 'badge-warning'}" title="Due ${prettyDate(t.reminder_date)}">⏰ ${prettyDate(t.reminder_date)}</span>` : ''}</td>
      <td class="amount ${isIn ? 'pos' : 'neg'}">${rs(t.amount)}</td>
      <td>${t.discount ? rs(t.discount) : '—'}${t.vat_percent ? `<div class="hint" style="color:var(--text-tertiary);font-size:11px">VAT ${fmt(t.vat_percent)}%</div>` : ''}</td>
      <td>${t.payment_method ? esc(t.payment_method) : '—'}</td>
      <td>
        <button class="btn btn-sm btn-ghost" onclick="viewInvoice(${t.id})">🧾</button>
        <button class="btn btn-sm" onclick="editTxn(${t.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="delTxn(${t.id})">Delete</button>
      </td>
    </tr>`).join('');

  const partyOpts = cfg.partyType
    ? `<option value="">All ${cfg.partyType === 'customer' ? 'customers' : 'suppliers'}</option>` + state.parties.filter(p => p.type === cfg.partyType).map(p => `<option value="${p.id}" ${String(f.party_id) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
    : '';

  $('view').innerHTML = `
    <div class="row spread">
      <div><div class="page-title">${cfg.title}</div><div class="page-sub">${d.total} record${d.total === 1 ? '' : 's'} found${f.from ? ' · from ' + prettyDate(f.from) : ''}</div></div>
      <button class="btn btn-primary" onclick="addTxnOfType('${cfg.type}')">+ Add ${cfg.label || cfg.title}</button>
    </div>
    <div class="card card-pad mt-8">
      <div class="toolbar">
        <span class="badge badge-${meta[1]}">${meta[0]}</span>
        ${partyOpts ? `<select class="select" style="width:180px" onchange="setTxnParty(this.value)">${partyOpts}</select>` : ''}
        <input type="date" class="input" style="width:150px" value="${f.from}" onchange="setTxnFrom(this.value)"/>
        <span style="color:var(--text-tertiary)">to</span>
        <input type="date" class="input" style="width:150px" value="${f.to}" onchange="setTxnTo(this.value)"/>
        <div class="spacer"></div>
        <button class="btn btn-sm" onclick="resetTxnFilter()">Reset</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Date</th><th>${cfg.partyType === 'supplier' ? 'Supplier' : cfg.partyType === 'customer' ? 'Customer' : 'Details'}</th><th>Amount</th><th>Disc / VAT</th><th>Method</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6"><div class="empty">No ${cfg.title.toLowerCase()} recorded yet</div></td></tr>`}</tbody></table>
      </div>
      ${d.pages > 1 ? `<div class="row" style="justify-content:center;padding:14px">
        <button class="btn btn-sm" ${d.page <= 1 ? 'disabled' : ''} onclick="pageTxn(${d.page - 1})">← Prev</button>
        <span style="color:var(--text-tertiary);font-size:13px">Page ${d.page} of ${d.pages}</span>
        <button class="btn btn-sm" ${d.page >= d.pages ? 'disabled' : ''} onclick="pageTxn(${d.page + 1})">Next →</button>
      </div>` : ''}
    </div>`;
}

/* ---------- Parties ---------- */
async function renderParties() {
  setTitle('Parties');
  const tab = state.partyTab || 'all';
  const params = new URLSearchParams();
  if (state.partyCat) params.set('category', state.partyCat);
  if (state.partyQ) params.set('q', state.partyQ);
  const d = await api('/parties' + (params.toString() ? '?' + params : ''));
  const list = d.parties.filter(p => tab === 'all' || p.type === tab);
  const cats = Array.from(new Set(d.parties.map(p => p.category).filter(Boolean)));
  const tabsHtml = [['all', 'All'], ['customer', 'Customers'], ['supplier', 'Suppliers']]
    .map(([v, l]) => `<button class="${tab === v ? 'active' : ''}" onclick="setPartyTab('${v}')">${l}</button>`).join('');

  const cards = list.map(p => `
    <div class="card card-pad" style="display:flex;flex-direction:column;gap:10px;justify-content:space-between">
      <div>
        <div class="row spread">
          <div>
            <span class="badge ${p.type === 'customer' ? 'badge-info' : 'badge-warning'}">${p.type === 'customer' ? 'Customer' : 'Supplier'}</span>
            ${p.category ? ` <span class="badge badge-soft">${esc(p.category)}</span>` : ''}
          </div>
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
      <input class="input" style="width:200px" placeholder="Search name, address..." value="${esc(state.partyQ || '')}" oninput="setPartyQ(this.value)"/>
      ${cats.length ? `<select class="select" style="width:160px" onchange="setPartyCat(this.value)"><option value="">All categories</option>${cats.map(c => `<option value="${esc(c)}" ${state.partyCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px" class="mt-8">
      ${cards || '<div class="card empty" style="grid-column:1/-1">No parties yet</div>'}
    </div>`;
}

function setPartyTab(t) { state.partyTab = t; route(); }
function setPartyQ(v) { state.partyQ = v; clearTimeout(state.__pqT); state.__pqT = setTimeout(route, 350); }
function setPartyCat(c) { state.partyCat = c; route(); }

function partyModal(p) {
  const editing = !!p;
  const wrap = openModal(editing ? 'Edit party' : 'Add party', `
    <div class="field"><label>Type</label>
      <select class="select" id="p_type"><option value="customer" ${p && p.type === 'customer' ? 'selected' : ''}>Customer</option><option value="supplier" ${p && p.type === 'supplier' ? 'selected' : ''}>Supplier</option></select>
    </div>
    <div class="field"><label>Name *</label><input class="input" id="p_name" value="${esc(p && p.name || '')}" placeholder="e.g. Ram Shrestha, Hari Traders"/></div>
    <div class="row">
      <div class="field" style="flex:1"><label>Category</label><input class="input" id="p_cat" list="partyCats" placeholder="e.g. Wholesale" value="${esc(p && p.category || '')}"/><datalist id="partyCats">${Array.from(new Set(state.parties.map(x => x.category).filter(Boolean))).map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field" style="flex:1"><label>Phone</label><input class="input" id="p_phone" maxlength="10" value="${esc(p && p.phone || '')}"/></div>
    </div>
    <div class="row">
      <div class="field" style="flex:1"><label>Opening balance (Rs.)</label><input class="input" id="p_ob" type="number" step="any" value="${p && p.opening_balance ? p.opening_balance : 0}"/></div>
      <div class="field" style="flex:1"><label>Address</label><input class="input" id="p_addr" value="${esc(p && p.address || '')}"/></div>
    </div>
    <div class="field"><label>Email</label><input class="input" id="p_email" value="${esc(p && p.email || '')}"/></div>
    <div class="field"><label>Note</label><input class="input" id="p_note" value="${esc(p && p.note || '')}"/></div>
  `, `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-primary" id="saveParty">Save</button>`);

  wrap.querySelector('#saveParty').addEventListener('click', async () => {
    const body = {
      type: wrap.querySelector('#p_type').value,
      name: wrap.querySelector('#p_name').value.trim(),
      category: wrap.querySelector('#p_cat').value.trim(),
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
  const meta = { sale: ['Sale', 'success'], purchase: ['Purchase', 'info'], expense: ['Expense', 'danger'], other_income: ['Other income', 'success'], payment_in: ['Received', 'success'], payment_out: ['Paid out', 'warning'] };
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
        <div class="page-sub">${p.type === 'customer' ? 'Customer' : 'Supplier'} · +977 ${esc(p.phone || '—')}${p.address ? ' · ' + esc(p.address) : ''}${p.category ? ' · ' + esc(p.category) : ''}</div>
      </div>
    </div>
    <div class="row">
      <button class="btn btn-primary" onclick="addTxnForParty(${p.id}, '${p.type}')">+ Record transaction</button>
      ${p.phone ? `<button class="btn" onclick="waRemind(${p.id})">🟢 WhatsApp reminder</button>` : ''}
      <button class="btn btn-ghost" onclick="adjustBalance(${p.id})">⚖ Adjust balance</button>
    </div>
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

async function waRemind(id) {
  const d = await api('/parties/' + id + '/ledger');
  const p = d.party;
  if (!p.phone) return toast('No phone number on file', 'error');
  const due = d.lines.find(l => l.reminder_date) || {};
  const text = `Namaste ${p.name}, this is ${state.business.name}. Just a reminder about your pending balance of Rs. ${fmt(d.closing)}. Please settle at your earliest convenience. Thank you!${due.reminder_date ? ' (Due: ' + prettyDate(due.reminder_date) + ')' : ''}`;
  window.open('https://wa.me/977' + p.phone + '?text=' + encodeURIComponent(text), '_blank');
  toast('Opening WhatsApp...');
}

function adjustBalance(id) {
  const wrap = openModal('Adjust balance', `
    <p style="color:var(--text-secondary);margin-bottom:12px">Add or reduce the party's balance without creating a transaction. Use a negative value to reduce.</p>
    <div class="field"><label>Adjustment amount (Rs.)</label><input class="input" id="adj_amt" type="number" step="any" placeholder="e.g. 500 or -500"/></div>
  `, `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-primary" id="saveAdj">Apply</button>`);
  wrap.querySelector('#saveAdj').addEventListener('click', async () => {
    const delta = Number(wrap.querySelector('#adj_amt').value) || 0;
    if (!delta) return toast('Enter an amount', 'error');
    try {
      await api('/parties/' + id + '/balance', { method: 'PUT', body: { delta } });
      toast('Balance adjusted');
      closeModal(wrap); await loadRefs(); route();
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* ---------- Items ---------- */
async function renderItems() {
  setTitle('Inventory');
  const d = await api('/items' + (state.itemCat ? '?category=' + encodeURIComponent(state.itemCat) : ''));
  const cats = Array.from(new Set(d.items.map(i => i.category).filter(Boolean)));
  const rows = d.items.map(i => `
    <tr>
      <td style="font-weight:600">${esc(i.name)}${i.category ? `<div class="hint" style="color:var(--text-tertiary);font-size:11px">${esc(i.category)}</div>` : ''}</td>
      <td>${esc(i.unit)}</td>
      <td class="amount">${rs(i.purchase_price)}</td>
      <td class="amount">${i.wholesale_price ? rs(i.wholesale_price) : '—'}</td>
      <td class="amount">${rs(i.sale_price)}</td>
      <td class="amount">${i.mrp ? rs(i.mrp) : '—'}</td>
      <td>
        <span class="amount">${fmt(i.stock)}</span>
        ${i.low_stock > 0 && i.stock <= i.low_stock ? ` <span class="badge badge-danger">Low</span>` : ''}
      </td>
      <td>
        <button class="btn btn-sm" onclick="editItem(${i.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="delItem(${i.id})">Delete</button>
      </td>
    </tr>`).join('');

  const catOpts = cats.map(c => `<option value="${esc(c)}" ${state.itemCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  $('view').innerHTML = `
    <div class="row spread">
      <div><div class="page-title">Inventory</div><div class="page-sub">${d.items.length} items · stock updates automatically from transactions</div></div>
      <button class="btn btn-primary" onclick="addItem()">+ Add item</button>
    </div>
    <div class="toolbar mt-8">
      ${cats.length ? `<select class="select" style="width:180px" onchange="setItemCat(this.value)"><option value="">All categories</option>${catOpts}</select>` : ''}
      <span class="hint" style="color:var(--text-tertiary);font-size:12px">Wholesale &amp; MRP prices can be used as rate suggestions when recording sales and purchases.</span>
    </div>
    <div class="card card-pad mt-8">
      <div class="table-wrap"><table>
        <thead><tr><th>Item</th><th>Unit</th><th>Buy</th><th>Wholesale</th><th>Sell</th><th>MRP</th><th>Stock</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8"><div class="empty">No items yet. Add your products to track inventory.</div></td></tr>'}</tbody>
      </table></div>
    </div>`;
}
function setItemCat(c) { state.itemCat = c; route(); }

function itemModal(it) {
  const editing = !!it;
  const wrap = openModal(editing ? 'Edit item' : 'Add item', `
    <div class="field"><label>Item name *</label><input class="input" id="i_name" value="${esc(it && it.name || '')}" placeholder="e.g. Coca-Cola 1L"/></div>
    <div class="row">
      <div class="field" style="flex:1"><label>Category</label><input class="input" id="i_cat" list="itemCats" placeholder="e.g. Cold drinks" value="${esc(it && it.category || '')}"/><datalist id="itemCats">${Array.from(new Set(state.items.map(i => i.category).filter(Boolean))).map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field" style="flex:1"><label>Unit</label>
        <select class="select" id="i_unit"><option ${it && it.unit === 'pcs' ? 'selected' : ''}>pcs</option><option ${it && it.unit === 'kg' ? 'selected' : ''}>kg</option><option ${it && it.unit === 'liter' ? 'selected' : ''}>liter</option><option ${it && it.unit === 'box' ? 'selected' : ''}>box</option><option ${it && it.unit === 'dozen' ? 'selected' : ''}>dozen</option><option ${it && it.unit === 'pack' ? 'selected' : ''}>pack</option></select>
      </div>
    </div>
    <div class="row">
      <div class="field" style="flex:1"><label>Buy price (Rs.)</label><input class="input" id="i_bp" type="number" step="any" value="${it ? it.purchase_price : 0}"/></div>
      <div class="field" style="flex:1"><label>Wholesale price (Rs.)</label><input class="input" id="i_wp" type="number" step="any" value="${it ? it.wholesale_price : 0}"/></div>
    </div>
    <div class="row">
      <div class="field" style="flex:1"><label>Sell price (Rs.)</label><input class="input" id="i_sp" type="number" step="any" value="${it ? it.sale_price : 0}"/></div>
      <div class="field" style="flex:1"><label>MRP (Rs.)</label><input class="input" id="i_mrp" type="number" step="any" value="${it ? it.mrp : 0}"/></div>
    </div>
    <div class="row">
      <div class="field" style="flex:1"><label>Stock on hand</label><input class="input" id="i_stock" type="number" step="any" value="${it ? it.stock : 0}"/></div>
      <div class="field" style="flex:1"><label>Low stock alert at</label><input class="input" id="i_low" type="number" step="any" value="${it ? it.low_stock : 0}"/></div>
    </div>
    <div class="hint" style="color:var(--text-tertiary);font-size:12px">Wholesale and MRP are used as quick rate suggestions in sales and purchases (0 = off).</div>
  `, `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-primary" id="saveItem">Save</button>`);

  wrap.querySelector('#saveItem').addEventListener('click', async () => {
    const body = {
      name: wrap.querySelector('#i_name').value.trim(),
      category: wrap.querySelector('#i_cat').value.trim(),
      unit: wrap.querySelector('#i_unit').value,
      stock: Number(wrap.querySelector('#i_stock').value) || 0,
      purchase_price: Number(wrap.querySelector('#i_bp').value) || 0,
      wholesale_price: Number(wrap.querySelector('#i_wp').value) || 0,
      sale_price: Number(wrap.querySelector('#i_sp').value) || 0,
      mrp: Number(wrap.querySelector('#i_mrp').value) || 0,
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
      <div class="stat cash"><div class="s-label">Other income</div><div class="s-value pos">${rs(d.byType.other_income)}</div></div>
      <div class="stat profit"><div class="s-label">Profit / Loss</div><div class="s-value ${d.profit >= 0 ? 'pos' : 'neg'}">${rs(d.profit)}</div><div class="s-note">${d.byType.sale ? profitPct + '% margin' : ''}</div></div>
    </div>
    <div class="stats mt-16">
      <div class="stat recv"><div class="s-label">VAT collected / paid</div><div class="s-value">${rs(d.vat)}</div><div class="s-note">On sales &amp; purchases with VAT%</div></div>
      <div class="stat pay"><div class="s-label">Discounts given</div><div class="s-value neg">${rs(d.discount)}</div><div class="s-note">On sales &amp; purchases</div></div>
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
          <div class="field" style="flex:1"><label>Invoice prefix</label><input class="input" id="b_prefix" maxlength="8" value="${esc(b.invoice_prefix || 'INV')}"/><div class="hint" style="color:var(--text-tertiary);font-size:12px">e.g. INV → INV-000123</div></div>
        </div>
        <div class="row">
          <div class="field" style="flex:1"><label>Fiscal year starts</label><input class="input" id="b_fy" type="date" value="${esc(b.fiscal_year_start)}"/></div>
          <div class="field" style="flex:1"><label>EMI calculator</label><button class="btn" style="width:100%" onclick="emiModal()">📱 Open calculator</button></div>
        </div>
        <button class="btn btn-primary" onclick="saveBusiness()">Save changes</button>
      </div>
      <div>
        <div class="card card-pad mb-16">
          <h3 class="mb-16">Appearance</h3>
          <div class="row spread" style="margin-bottom:14px">
            <div><b>Dark mode</b><div class="hint" style="color:var(--text-tertiary);font-size:12px">Easy on the eyes at night</div></div>
            <button class="btn btn-sm" onclick="toggleDark()">${state.dark ? '🌞 Light' : '🌙 Dark'}</button>
          </div>
          <div class="row spread">
            <div><b>Font size</b><div class="hint" style="color:var(--text-tertiary);font-size:12px">Adjust the app text size</div></div>
            <select class="select" style="width:120px" onchange="setFontSize(this.value)">
              <option value="14" ${state.fontSize === 14 ? 'selected' : ''}>Small</option>
              <option value="16" ${state.fontSize === 16 ? 'selected' : ''}>Normal</option>
              <option value="18" ${state.fontSize === 18 ? 'selected' : ''}>Large</option>
              <option value="20" ${state.fontSize === 20 ? 'selected' : ''}>Large +</option>
            </select>
          </div>
        </div>
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
    invoice_prefix: $('b_prefix').value.trim(),
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

function applyAppearance() {
  const d = state.dark;
  document.documentElement.classList.toggle('dark', d);
  localStorage.setItem('lenden_dark', d ? '1' : '0');
  document.documentElement.style.fontSize = (state.fontSize || 16) + 'px';
  localStorage.setItem('lenden_font', String(state.fontSize || 16));
}
function toggleDark() {
  state.dark = !state.dark;
  applyAppearance();
  route();
}
function setFontSize(v) {
  state.fontSize = Number(v) || 16;
  applyAppearance();
}

function emiModal() {
  const wrap = openModal('EMI Calculator', `
    <div class="field"><label>Loan amount (Rs.)</label><input class="input" id="emi_p" type="number" step="any" value="100000"/></div>
    <div class="row">
      <div class="field" style="flex:1"><label>Annual interest rate (%)</label><input class="input" id="emi_r" type="number" step="any" value="13"/></div>
      <div class="field" style="flex:1"><label>Tenure (months)</label><input class="input" id="emi_n" type="number" step="1" value="12"/></div>
    </div>
    <div class="row">
      <button class="btn btn-primary" onclick="calcEmi()">Calculate</button>
      <button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Close</button>
    </div>
    <div id="emiResult" class="mt-8"></div>
  `);
}
window.calcEmi = () => {
  const wrap = document.querySelector('.modal-backdrop');
  const P = Number((wrap.querySelector('#emi_p') || {}).value) || 0;
  const r = (Number((wrap.querySelector('#emi_r') || {}).value) || 0) / 12 / 100;
  const n = Number((wrap.querySelector('#emi_n') || {}).value) || 1;
  const out = wrap.querySelector('#emiResult');
  if (P <= 0 || n <= 0) { out.innerHTML = '<div class="empty">Enter valid values</div>'; return; }
  let emi;
  if (r === 0) emi = P / n;
  else emi = P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  const total = emi * n;
  const interest = total - P;
  out.innerHTML = `
    <div class="stats mt-8">
      <div class="stat profit"><div class="s-label">Monthly EMI</div><div class="s-value">${rs(emi)}</div></div>
      <div class="stat purchase"><div class="s-label">Total interest</div><div class="s-value neg">${rs(interest)}</div></div>
      <div class="stat recv"><div class="s-label">Total repayment</div><div class="s-value">${rs(total)}</div></div>
    </div>`;
};

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

/* ---------- Manage Accounts ---------- */
async function renderAccounts() {
  setTitle('Manage Accounts');
  const d = await api('/accounts');
  const typeLabel = { cash: 'Cash', bank: 'Bank', wallet: 'Wallet', card: 'Card', other: 'Other' };
  const cards = d.accounts.map(a => `
    <div class="card card-pad" style="display:flex;flex-direction:column;gap:10px;justify-content:space-between">
      <div class="row spread">
        <span class="badge ${a.type === 'cash' ? 'badge-warning' : a.type === 'bank' ? 'badge-info' : a.type === 'wallet' ? 'badge-success' : 'badge-soft'}">${typeLabel[a.type] || 'Other'}</span>
        ${a.id ? `<button class="btn btn-sm btn-ghost" onclick="delAccount(${a.id})">🗑</button>` : '<span style="color:var(--text-tertiary);font-size:12px">from transactions</span>'}
      </div>
      <div>
        <div style="font-weight:700;font-size:16px">${esc(a.name)}</div>
        <div style="font-size:12px;color:var(--text-tertiary)">${fmt(a.in)} in · ${fmt(a.out)} out</div>
      </div>
      <div class="amount ${a.balance >= 0 ? 'pos' : 'neg'}" style="font-size:20px">${rs(a.balance)}</div>
    </div>`).join('');

  $('view').innerHTML = `
    <div class="row spread">
      <div><div class="page-title">Manage Accounts</div><div class="page-sub">Payment accounts used in your transactions</div></div>
      <button class="btn btn-primary" onclick="addAccount()">+ Add account</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px" class="mt-8">
      ${cards || '<div class="card empty">No accounts yet. Add your payment accounts or record transactions with a payment method.</div>'}
    </div>`;
}

function addAccount() {
  const wrap = openModal('Add account', `
    <div class="field"><label>Account name *</label><input class="input" id="a_name" placeholder="e.g. Cash, Nepal Bank, Khalti, eSewa"/></div>
    <div class="field"><label>Type</label>
      <select class="select" id="a_type"><option value="cash">Cash</option><option value="bank">Bank</option><option value="wallet">Wallet</option><option value="card">Card</option><option value="other">Other</option></select>
    </div>
  `, `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-primary" id="saveAccount">Add</button>`);
  wrap.querySelector('#saveAccount').addEventListener('click', async () => {
    const body = { name: wrap.querySelector('#a_name').value.trim(), type: wrap.querySelector('#a_type').value };
    if (!body.name) return toast('Account name is required', 'error');
    try { await api('/accounts', { method: 'POST', body }); toast('Account added'); closeModal(wrap); route(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

async function delAccount(id) {
  const wrap = openModal('Delete account', `<p style="color:var(--text-secondary)">This removes the account name. Past transactions are kept unchanged.</p>`,
    `<button class="btn" onclick="closeModal(this.closest('.modal-backdrop'))">Cancel</button><button class="btn btn-danger" id="cDelA">Delete</button>`);
  wrap.querySelector('#cDelA').addEventListener('click', async () => {
    try { await api('/accounts/' + id, { method: 'DELETE' }); toast('Account deleted'); closeModal(wrap); route(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

/* ---------- Import Data ---------- */
function parseCSV(text) {
  const rows = [];
  let cur = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length && row.some(x => x !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some(x => x !== '')) rows.push(row); }
  return rows;
}

function rowsToObjects(rows, mapping) {
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(r => {
    const o = {};
    header.forEach((h, i) => { if (mapping[h]) o[mapping[h]] = (r[i] || '').trim(); });
    return o;
  }).filter(o => Object.keys(o).length);
}

function readFileAsText(input) {
  return new Promise((resolve, reject) => {
    const f = input.files[0];
    if (!f) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(f);
  });
}

async function renderImport() {
  setTitle('Import Data');
  $('view').innerHTML = `
    <div class="page-title">Import Data</div>
    <div class="page-sub">Bring data into Len Den from a backup or CSV files</div>
    <div class="grid-2">
      <div class="card card-pad">
        <h3 class="mb-16">Restore backup</h3>
        <p style="color:var(--text-secondary);margin-bottom:14px">Upload a Len Den JSON backup. This replaces all current data.</p>
        <div class="row">
          <button class="btn btn-primary" onclick="document.getElementById('impJson').click()">⬆ Restore JSON backup</button>
          <input type="file" id="impJson" accept=".json" class="hidden"/>
        </div>
      </div>
      <div class="card card-pad">
        <h3 class="mb-16">Import parties (CSV)</h3>
        <p style="color:var(--text-secondary);margin-bottom:14px">Columns: <code>type,name,phone,address,email,opening_balance,note,category</code>. <code>type</code> is <code>customer</code> or <code>supplier</code>.</p>
        <div class="row">
          <button class="btn" onclick="document.getElementById('impParties').click()">⬆ Import parties</button>
          <input type="file" id="impParties" accept=".csv,.txt" class="hidden"/>
          <button class="btn btn-sm" onclick="dlTemplate('parties')">⬇ Template</button>
        </div>
      </div>
      <div class="card card-pad">
        <h3 class="mb-16">Import transactions (CSV)</h3>
        <p style="color:var(--text-secondary);margin-bottom:14px">Columns: <code>type,date,party,item,quantity,rate,amount,discount,vat_percent,reminder_date,payment_method,note</code>. Parties and items are matched by name.</p>
        <div class="row">
          <button class="btn" onclick="document.getElementById('impTxn').click()">⬆ Import transactions</button>
          <input type="file" id="impTxn" accept=".csv,.txt" class="hidden"/>
          <button class="btn btn-sm" onclick="dlTemplate('txn')">⬇ Template</button>
        </div>
      </div>
      <div class="card card-pad" style="border-color:#f3c5c7">
        <h3 class="mb-16" style="color:var(--danger)">Reset all data</h3>
        <p style="color:var(--text-secondary);margin-bottom:14px">Delete all transactions, parties and items. This cannot be undone.</p>
        <button class="btn btn-danger" onclick="resetData()">Reset business data</button>
      </div>
    </div>`;

  $('impJson').addEventListener('change', async e => {
    const text = await readFileAsText(e.target);
    if (!text) return;
    try {
      const data = JSON.parse(text);
      await api('/import', { method: 'POST', body: data });
      toast('Backup restored');
      state.business = (await api('/me')).business;
      await loadRefs(); route();
    } catch (err) { toast(err.message, 'error'); }
  });

  $('impParties').addEventListener('change', async e => {
    const text = await readFileAsText(e.target);
    if (!text) return;
    const rows = parseCSV(text);
    const list = rowsToObjects(rows, { type: 'type', name: 'name', phone: 'phone', address: 'address', email: 'email', opening_balance: 'opening_balance', note: 'note', category: 'category' });
    if (!list.length) return toast('No valid rows found in CSV', 'error');
    try {
      const j = await api('/import/csv/parties', { method: 'POST', body: list });
      toast(j.count + ' party' + (j.count === 1 ? '' : 'ies') + ' imported');
      await loadRefs(); route();
    } catch (err) { toast(err.message, 'error'); }
  });

  $('impTxn').addEventListener('change', async e => {
    const text = await readFileAsText(e.target);
    if (!text) return;
    const rows = parseCSV(text);
    const list = rowsToObjects(rows, { type: 'type', date: 'date', party: 'party', item: 'item', quantity: 'quantity', rate: 'rate', amount: 'amount', discount: 'discount', vat_percent: 'vat_percent', reminder_date: 'reminder_date', payment_method: 'payment_method', note: 'note' });
    if (!list.length) return toast('No valid rows found in CSV', 'error');
    try {
      const j = await api('/import/csv/transactions', { method: 'POST', body: list });
      toast(j.count + ' transaction' + (j.count === 1 ? '' : 's') + ' imported');
      await loadRefs(); route();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function dlTemplate(which) {
  const content = which === 'parties'
    ? 'type,name,phone,address,email,opening_balance,note,category\ncustomer,Ram Shrestha,9841234567,Kathmandu,ram@example.com,0,,Retail\nsupplier,Hari Traders,9801234567,Lalitpur,,1000,,Wholesale\n'
    : 'type,date,party,item,quantity,rate,amount,discount,vat_percent,reminder_date,payment_method,note\nsale,2026-08-07,Ram Shrestha,Notebook,2,50,100,0,0,,Cash,\npurchase,2026-08-06,Hari Traders,,,10,500,0,13,,Bank,\nexpense,2026-08-05,,,1,300,300,0,0,,Cash,Rent\n';
  const blob = new Blob([content], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = which === 'parties' ? 'parties-template.csv' : 'transactions-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Refer & Win ---------- */
async function renderRefer() {
  setTitle('Refer & Win');
  const code = 'LD' + String(state.business.id || 0).padStart(4, '0');
  const link = location.origin + '/?ref=' + code;
  const shareText = 'Use Len Den to manage your business khata, inventory and reports easily. Try it: ' + link;
  $('view').innerHTML = `
    <div class="page-title">Refer & Win</div>
    <div class="page-sub">Invite fellow business owners and both of you get benefits</div>
    <div class="card card-pad" style="background:linear-gradient(135deg,#6359e0,#8b7cf6);color:#fff;border:none">
      <div class="row spread" style="flex-wrap:nowrap">
        <div>
          <div style="font-size:13px;opacity:.85">Your referral code</div>
          <div style="font-size:34px;font-weight:800;letter-spacing:3px;margin-top:4px">${code}</div>
        </div>
        <button class="btn" style="background:#fff;color:#6359e0;font-weight:700" onclick="copyReferral('${link}')">📋 Copy link</button>
      </div>
    </div>
    <div class="grid-2 mt-16">
      <div class="card card-pad">
        <h3 class="mb-16">How it works</h3>
        ${[['Share your link', 'Send your referral link to other business owners.'],
           ['They sign up', 'They create a Len Den business and start using it.'],
           ['You both win', 'When they stay active, both of you get reward benefits.']]
          .map((s, i) => `<div class="row" style="margin:12px 0"><span class="badge badge-primary" style="width:26px;height:26px;justify-content:center">${i + 1}</span><div><b>${s[0]}</b><div class="hint" style="color:var(--text-tertiary);font-size:12px">${s[1]}</div></div></div>`).join('')}
      </div>
      <div class="card card-pad">
        <h3 class="mb-16">Share now</h3>
        <button class="btn btn-block mb-16" onclick="shareReferral('whatsapp')">🟢 Share on WhatsApp</button>
        <button class="btn btn-block mb-16" onclick="shareReferral('copy', '${link}')">📋 Copy referral link</button>
        <div class="hint" style="color:var(--text-tertiary);font-size:12px">Referred business must be created with your link to count.</div>
      </div>
    </div>`;
  window.__referLink = link;
  window.__referShareText = shareText;
}
window.copyReferral = link => { navigator.clipboard && navigator.clipboard.writeText(link); toast('Referral link copied'); };
window.shareReferral = (how, link) => {
  if (how === 'whatsapp') {
    window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(window.__referShareText || ''), '_blank');
  } else {
    window.copyReferral(link || window.__referLink);
  }
};

/* ---------- Help & Support ---------- */
async function renderHelp() {
  setTitle('Help & Support');
  const faqs = [
    ['How do I add a party?', 'Go to Parties, click "+ Add party", choose Customer or Supplier, fill the details and save.'],
    ['How do I record a sale?', 'Go to Sales, click "+ Add Sale", select the customer and amount (add an item to track inventory), then save.'],
    ['How does the ledger work?', 'Each party has its own ledger. Open Parties, pick a party and click "Ledger" to see every transaction and the running balance.'],
    ['How do I backup my data?', 'Go to Settings or Import Data and export a JSON backup, then download it to your device.'],
    ['Why is my stock changing?', 'Sales reduce stock and purchases increase it automatically when you attach an item to the transaction.'],
  ];
  $('view').innerHTML = `
    <div class="page-title">Help & Support</div>
    <div class="page-sub">Frequently asked questions and ways to reach us</div>
    <div class="grid-2">
      <div class="card card-pad">
        <h3 class="mb-16">Frequently asked questions</h3>
        ${faqs.map((f, i) => `
          <div class="faq" style="border-bottom:1px solid var(--border);padding:12px 0">
            <button class="faq-q" onclick="this.parentElement.classList.toggle('open')" style="width:100%;display:flex;justify-content:space-between;align-items:center;background:none;border:none;cursor:pointer;font-weight:600;font-size:14px;font-family:inherit;color:var(--text);text-align:left">
              ${f[0]} <span style="color:var(--text-tertiary)">▾</span>
            </button>
            <div class="faq-a hidden" style="color:var(--text-secondary);padding-top:8px;font-size:13px">${f[1]}</div>
          </div>`).join('')}
      </div>
      <div class="card card-pad">
        <h3 class="mb-16">Get in touch</h3>
        <div class="row" style="margin-bottom:12px"><span style="font-size:20px">💬</span><div><b>WhatsApp</b><div class="hint" style="color:var(--text-tertiary);font-size:12px">Fastest way to reach support</div></div></div>
        <button class="btn btn-block mb-16" onclick="window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent('I need help with Len Den'))">Message support</button>
        <div class="row" style="margin-bottom:12px"><span style="font-size:20px">📘</span><div><b>Tutorials</b><div class="hint" style="color:var(--text-tertiary);font-size:12px">Step-by-step guides in the Tutorials menu</div></div></div>
        <button class="btn btn-block" onclick="go('tutorials')">Open tutorials</button>
      </div>
    </div>`;
  $$('.faq .faq-q').forEach(b => b.addEventListener('click', () => {
    b.parentElement.classList.toggle('open');
    b.parentElement.querySelector('.faq-a').classList.toggle('hidden');
  }));
}

/* ---------- Tutorials ---------- */
async function renderTutorials() {
  setTitle('Tutorials');
  const guides = [
    ['👥', 'Add your first party', ['Open the Parties menu.', 'Click "+ Add party".', 'Choose Customer or Supplier.', 'Enter name and phone, then Save.']],
    ['🧾', 'Record a sale', ['Open the Sales menu.', 'Click "+ Add Sale".', 'Select the customer and enter the amount (optionally attach an item).', 'Click Save to update the ledger and stock.']],
    ['📦', 'Track inventory', ['Open the Inventory menu and add your items with prices.', 'Attach an item when you record sales and purchases.', 'Stock updates automatically and low-stock warnings appear on the dashboard.']],
    ['📈', 'Read the reports', ['Open the Reports menu.', 'Choose a time range: Today, 7 days, 30 days or All time.', 'See total sales, purchases, expenses and profit.']],
    ['💾', 'Backup & restore', ['Go to Settings > Backup & restore.', 'Click "Export backup" to download your data as JSON.', 'Use Import Data to restore it anytime.']],
  ];
  $('view').innerHTML = `
    <div class="page-title">Tutorials</div>
    <div class="page-sub">Step-by-step guides to get the most out of Len Den</div>
    <div class="grid-2">
      ${guides.map(g => `
        <div class="card card-pad">
          <div style="font-size:26px;margin-bottom:8px">${g[0]}</div>
          <h3 class="mb-8">${g[1]}</h3>
          <ol style="color:var(--text-secondary);font-size:13px;line-height:1.7;padding-left:18px;margin-top:6px">
            ${g[2].map(s => `<li>${s}</li>`).join('')}
          </ol>
        </div>`).join('')}
    </div>`;
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
window.addTxnOfType = addTxnOfType;
window.editTxn = editTxn;
window.delTxn = delTxn;
window.setPartyTab = setPartyTab;
window.setPartyQ = setPartyQ;
window.setPartyCat = setPartyCat;
window.setItemCat = setItemCat;
window.addParty = addParty;
window.editParty = editParty;
window.delParty = delParty;
window.viewLedger = viewLedger;
window.addTxnForParty = addTxnForParty;
window.waRemind = waRemind;
window.adjustBalance = adjustBalance;
window.viewInvoice = viewInvoice;
window.setDaybookDate = setDaybookDate;
window.toggleDark = toggleDark;
window.setFontSize = setFontSize;
window.emiModal = emiModal;
window.addItem = addItem;
window.editItem = editItem;
window.delItem = delItem;
window.setReportRange = setReportRange;
window.addStaff = addStaff;
window.delStaff = delStaff;
window.addAccount = addAccount;
window.delAccount = delAccount;
window.dlTemplate = dlTemplate;
window.saveBusiness = saveBusiness;
window.exportData = exportData;
window.resetData = resetData;
window.closeModal = closeModal;

boot();

const BASE = 'http://localhost:3000';
let cookie = '';
const j = async (path, opts = {}) => {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(opts.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
};
const ok = (n, c) => console.log((c ? 'PASS' : 'FAIL') + ' - ' + n);

(async () => {
  const phone = '9805550001';
  const reqOtp = await j('/api/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) });
  const devOtp = reqOtp.body.devOtp;
  const login = await fetch(BASE + '/api/auth/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp: devOtp }),
  });
  const setCook = login.headers.getSetCookie();
  cookie = (setCook || []).map(c => c.split(';')[0]).join('; ');

  const parties = await j('/api/parties');
  const customers = parties.body.parties.filter(p => p.type === 'customer');
  const suppliers = parties.body.parties.filter(p => p.type === 'supplier');
  const items = await j('/api/items');
  const it = items.body.items[0];
  const cust = customers[0];
  const supp = suppliers[0] || (await j('/api/parties', { method: 'POST', body: JSON.stringify({ type: 'supplier', name: 'Smoke Supplier', phone: '9800000099', opening_balance: 100, pay_type: 'give' }) })).body;

  const suppP = supp && supp.id ? supp : (await j('/api/parties')).body.parties.find(p => p.type === 'supplier');

  // stock before
  const before = (await j('/api/items')).body.items.find(i => i.id === it.id);

  // 1. quotation (no stock/balance effect)
  const qt = await j('/api/transactions', { method: 'POST', body: JSON.stringify({ type: 'quotation', party_id: cust.id, item_id: it.id, quantity: 2, rate: 50, amount: 100, date: '2026-08-07', note: 'quote smoke' }) });
  ok('quotation created', qt.status === 200);
  const afterQt = (await j('/api/items')).body.items.find(i => i.id === it.id);
  ok('quotation does not change stock', Number(afterQt.stock) === Number(before.stock));

  // 2. sale → stock decreases
  const sale = await j('/api/transactions', { method: 'POST', body: JSON.stringify({ type: 'sale', party_id: cust.id, item_id: it.id, quantity: 3, rate: 100, amount: 300, date: '2026-08-07' }) });
  ok('sale created', sale.status === 200);
  const afterSale = (await j('/api/items')).body.items.find(i => i.id === it.id);
  ok('sale decreases stock by 3', Number(afterSale.stock) === Number(before.stock) - 3);

  // 3. sales_return → stock increases
  const sr = await j('/api/transactions', { method: 'POST', body: JSON.stringify({ type: 'sales_return', party_id: cust.id, item_id: it.id, quantity: 1, rate: 100, amount: 100, date: '2026-08-07' }) });
  ok('sales_return created', sr.status === 200);
  const afterSR = (await j('/api/items')).body.items.find(i => i.id === it.id);
  ok('sales_return increases stock by 1', Number(afterSR.stock) === Number(before.stock) - 2);

  // 4. purchase → stock increases
  const pur = await j('/api/transactions', { method: 'POST', body: JSON.stringify({ type: 'purchase', party_id: suppP.id, item_id: it.id, quantity: 5, rate: 80, amount: 400, date: '2026-08-07' }) });
  ok('purchase created', pur.status === 200);
  const afterPur = (await j('/api/items')).body.items.find(i => i.id === it.id);
  ok('purchase increases stock by 5', Number(afterPur.stock) === Number(before.stock) + 3);

  // 5. purchase_return → stock decreases
  const pr = await j('/api/transactions', { method: 'POST', body: JSON.stringify({ type: 'purchase_return', party_id: suppP.id, item_id: it.id, quantity: 2, rate: 80, amount: 160, date: '2026-08-07' }) });
  ok('purchase_return created', pr.status === 200);
  const afterPR = (await j('/api/items')).body.items.find(i => i.id === it.id);
  ok('purchase_return decreases stock by 2', Number(afterPR.stock) === Number(before.stock) + 1);

  // 6. party balance includes returns
  const ledger = await j('/api/parties/' + cust.id + '/ledger');
  ok('ledger has sales_return line', ledger.body.lines.some(l => l.type === 'sales_return'));

  // 7. CSV items import
  const csvImport = await j('/api/import/csv/items', { method: 'POST', body: JSON.stringify([
    { name: 'Smoke Item A', category: 'Test', code: 'SKU-SMOKE', type: 'service', purchase_price: '10', sale_price: '20', stock: '5' },
  ]) });
  ok('csv items import', csvImport.status === 200 && csvImport.body.count === 1);

  // 8. item with code + type round-trips through GET
  const itemsAfter = await j('/api/items?q=Smoke Item A');
  const s = itemsAfter.body.items[0];
  ok('imported item has code', s.code === 'SKU-SMOKE');
  ok('imported item has type', s.type === 'service');

  // cleanup created test data
  const txns = await j('/api/transactions?limit=1000');
  const mine = txns.body.transactions.filter(t => [qt.body.id, sale.body.id, sr.body.id, pur.body.id, pr.body.id].includes(t.id));
  await Promise.all(mine.map(t => j('/api/transactions/' + t.id, { method: 'DELETE' })));
  if (s) await j('/api/items/' + s.id, { method: 'DELETE' });

  console.log('\nAPI smoke test complete');
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

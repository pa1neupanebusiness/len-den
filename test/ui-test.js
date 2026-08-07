const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  const ok = (name, cond) => console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);

  // 1. login page
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  ok('login page title', (await page.title()).includes('Len Den'));

  // 2. do phone + OTP login
  const phone = '9805550001';
  const resp = await page.evaluate(async phone => {
    const r = await fetch('/api/auth/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
    return r.json();
  }, phone);
  await page.type('#phoneInput', phone);
  await page.click('#continueBtn');
  await page.waitForSelector('#stepOtp:not(.hidden)', { timeout: 5000 });
  const devOtp = await page.$eval('#devOtp', el => el.textContent.trim());
  ok('otp shown', devOtp.length === 6);
  await page.type('#otpBox input:nth-child(1)', devOtp[0]);
  for (let i = 1; i < 6; i++) await page.type('#otpBox input:nth-child(' + (i + 1) + ')', devOtp[i]);
  await page.click('#verifyBtn');
  await page.waitForSelector('.app', { timeout: 6000 });
  ok('logged in and app shell loaded', true);

  // 3. dashboard renders stats
  await page.waitForSelector('.stats .stat', { timeout: 6000 });
  ok('dashboard stats rendered', (await page.$$('.stats .stat')).length >= 3);

  // 4. parties: add a customer
  await page.click('[data-view="parties"]');
  await page.waitForFunction(() => document.getElementById('tbTitle').textContent === 'Parties', { timeout: 5000 });
  await page.waitForSelector('#view button.btn-primary', { timeout: 5000 });
  await page.click('#view button.btn-primary');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.type('#p_name', 'Test Customer');
  await page.type('#p_phone', '9801112222');
  await page.click('#saveParty');
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 5000 });
  const partyCards = await page.$$('#view .card');
  ok('party added', partyCards.length >= 1);

  // 5. khata: add a sale for the customer
  await page.click('[data-view="khata"]');
  await page.waitForFunction(() => document.getElementById('tbTitle').textContent === 'Transactions', { timeout: 5000 });
  ok('khata view open', true);
  await page.waitForSelector('#view button.btn-primary', { timeout: 5000 });
  await page.click('#view button.btn-primary');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.select('#f_party', await page.evaluate(() => document.querySelector('#f_party option:nth-child(2)').value));
  await page.type('#f_amount', '2500');
  await page.click('#saveTxn');
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 5000 });
  const txnRows = await page.$$('#view tbody tr');
  ok('sale added appears in list', txnRows.length >= 1);

  // 6. items: add item
  await page.click('[data-view="items"]');
  await page.waitForFunction(() => document.getElementById('tbTitle').textContent === 'Inventory', { timeout: 5000 });
  await page.waitForSelector('#view button.btn-primary', { timeout: 5000 });
  await page.click('#view button.btn-primary');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.type('#i_name', 'Notebook');
  await page.type('#i_stock', '50');
  await page.type('#i_sp', '120');
  await page.click('#saveItem');
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 5000 });
  ok('item added', (await page.$$('#view tbody tr')).length >= 1);

  // 7. party ledger view
  await page.click('[data-view="parties"]');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Ledger'), { timeout: 5000 });
  await page.evaluate(() => { Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Ledger').click(); });
  await page.waitForFunction(() => document.getElementById('tbTitle').textContent.startsWith('Ledger'), { timeout: 5000 });
  ok('ledger view open', true);

  // 8. reports
  await page.click('[data-view="reports"]');
  await page.waitForFunction(() => document.getElementById('tbTitle').textContent === 'Reports', { timeout: 5000 });
  await page.waitForSelector('#view .stats .stat', { timeout: 5000 });
  ok('reports stats', (await page.$$('#view .stats .stat')).length >= 4);

  // 9. settings
  await page.click('[data-view="settings"]');
  await page.waitForFunction(() => document.getElementById('tbTitle').textContent === 'Settings', { timeout: 5000 });
  ok('settings view open', true);

  await browser.close();
  if (errors.length) {
    console.log('\nCONSOLE/JS ERRORS:');
    errors.forEach(e => console.log('  ' + e));
  } else {
    console.log('\nNo JS errors detected.');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

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
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); else if (m.text().startsWith('ROUTE') || m.text().startsWith('RENDER')) console.log('  [page] ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  const ok = (name, cond) => console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  const goView = async (view, title) => {
    await page.click('[data-view="' + view + '"]');
    await page.waitForFunction(t => document.getElementById('tbTitle').textContent === t, { timeout: 5000 }, title);
  };
  const setVal = async (sel, val) => {
    await page.$eval(sel, (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, val);
  };
  const clickAdd = async (label) => {
    await page.waitForFunction(l => Array.from(document.querySelectorAll('#view button')).some(b => (b.textContent || '').includes(l)), { timeout: 5000 }, label);
    await page.evaluate(l => { Array.from(document.querySelectorAll('#view button')).find(b => (b.textContent || '').includes(l)).click(); }, label);
    await page.waitForSelector('.modal', { timeout: 5000 });
  };

  // 1. login page
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  ok('login page title', (await page.title()).includes('Len Den'));

  // 2. do phone + OTP login
  const phone = '9805550001';
  await page.evaluate(async phone => {
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

  // 4. sidebar has Karobar-style sections + all menu items (icons stripped)
  const sections = await page.$$eval('.nav-section', els => els.map(e => e.textContent.trim()));
  ok('menu sections = Business, Management, Business Tools, Others, Settings',
    JSON.stringify(sections) === JSON.stringify(['Business', 'Management', 'Business Tools', 'Others', 'Settings']));
  const labels = await page.$$eval('.nav-item', els => els.map(e => { const ico = e.querySelector('.ico'); const car = e.querySelector('.caret'); if (ico) ico.remove(); if (car) car.remove(); return e.textContent.trim(); }));
  const expected = ['Dashboard', 'Parties', 'Inventory', 'Sales', 'Create Sales Invoice', 'Add Payment In', 'Create New Quotation', 'Create Sales Return', 'Purchase', 'Purchase', 'Payment Out', 'Purchase Return', 'Expense', 'Other Income', 'Manage Accounts', 'Reports', 'Manage Staffs', 'Import Data', 'Import Parties', 'Import Items', 'Business Tools', 'Business Cards', 'Greeting Cards', 'Reminders', 'Bill Gallery', 'Barcode Generator', 'Refer & Win', 'Help & Support', 'Tutorials', 'Settings'];
  ok('menu items match Karobar list', JSON.stringify(labels) === JSON.stringify(expected));

  // 5. parties: add a customer with category
  await goView('parties', 'Parties');
  await clickAdd('Add party');
  await page.type('#p_name', 'Test Customer');
  await page.type('#p_cat', 'Retail');
  await page.type('#p_phone', '9801112222');
  await page.click('#saveParty');
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 5000 });
  ok('party added', (await page.$$('#view .card')).length >= 1);
  ok('party category badge shown', await page.evaluate(() => document.body.textContent.includes('Retail')));

  // 5b. party modal: photo, payment type, as-of-date, Save & New
  await page.evaluate(() => { Array.from(document.querySelectorAll('#view button')).find(b => b.textContent.includes('Add party')).click(); });
  await page.waitForSelector('.modal', { timeout: 5000 });
  ok('party modal has photo upload', await page.evaluate(() => !!document.querySelector('#p_photo')));
  ok('party modal has payment type toggle', await page.evaluate(() => Array.from(document.querySelectorAll('#p_paytype button')).map(b => b.textContent.trim()).join('|') === 'To Receive|To Give'));
  ok('party modal has as-of-date', await page.evaluate(() => !!document.querySelector('#p_asof')));
  ok('party modal has Save & New', await page.evaluate(() => !!document.querySelector('#saveAndNew')));
  await page.evaluate(() => document.querySelector('.modal-backdrop [data-close]').click());
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 5000 });

  // 6. sales: add a sale for the customer with discount, VAT and a due date
  await goView('sales', 'Sales');
  await clickAdd('Add Sale');
  await page.select('#f_party', await page.evaluate(() => document.querySelector('#f_party option:nth-child(2)').value));
  await setVal('#f_amount', '2500');
  await setVal('#f_discount', '100');
  await setVal('#f_vat', '13');
  await setVal('#f_reminder', '2026-09-01');
  await page.click('#saveTxn');
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 5000 });
  ok('sale added appears in sales list', (await page.$$('#view tbody tr')).length >= 1);
  ok('discount/vat/due shown in row', await page.evaluate(() => document.body.textContent.includes('VAT 13%')));

  // 6b. invoice popup opens
  await page.waitForSelector('#view button.btn-ghost', { timeout: 5000 });
  await page.click('#view button.btn-ghost');
  await page.waitForSelector('.modal #invoicePrint', { timeout: 5000 });
  ok('invoice modal renders', (await page.$$('.modal #invoicePrint')).length === 1);
  ok('invoice has ref number', await page.evaluate(() => /[A-Z]{2,}-\d+/.test(document.querySelector('.modal #invoicePrint').textContent)));
  await page.evaluate(() => document.querySelector('.modal-backdrop [data-close]').click());

  // 7. items: add item with category, wholesale & MRP
  await goView('items', 'Inventory');
  await clickAdd('Add New Item');
  await page.type('#i_name', 'Notebook');
  await page.type('#i_cat', 'Stationery');
  await setVal('#i_stock', '50');
  await setVal('#i_wp', '100');
  await setVal('#i_sp', '120');
  await setVal('#i_mrp', '135');
  await page.click('#saveItem');
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 5000 });
  ok('item added', (await page.$$('#view tbody tr')).length >= 1);
  ok('category visible in inventory', await page.evaluate(() => document.body.textContent.includes('Stationery')));

  // 7b. inventory toolbar: columns, filters, Import Items, Inventory Settings
  await page.waitForSelector('#view button[onclick^="inventorySettings"]', { timeout: 5000 });
  ok('inventory settings button present', true);
  ok('import items button present', await page.evaluate(() => Array.from(document.querySelectorAll('#view button')).some(b => b.textContent.includes('Import Items'))));
  ok('item type filter present', await page.evaluate(() => Array.from(document.querySelectorAll('#view select')).some(s => Array.from(s.options).some(o => o.text === 'Service'))));
  ok('item code column present', await page.evaluate(() => Array.from(document.querySelectorAll('#view thead th')).map(t => t.textContent.trim()).includes('Item Code')));
  ok('type column present', await page.evaluate(() => Array.from(document.querySelectorAll('#view thead th')).map(t => t.textContent.trim()).includes('Type')));

  // 8. purchase view renders
  await goView('purchase', 'Purchases');

  // 9. expense: add an expense with category
  await goView('expense', 'Expenses');
  await clickAdd('Add Expense');
  await page.type('#f_party', 'Rent');
  await setVal('#f_amount', '800');
  await page.click('#saveTxn');
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 5000 });
  ok('expense added appears in list', (await page.$$('#view tbody tr')).length >= 1);

  // 10. other income: add an income with category
  await goView('other_income', 'Other Income');
  await clickAdd('Add Income');
  await page.type('#f_party', 'Interest');
  await setVal('#f_amount', '500');
  await page.click('#saveTxn');
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 5000 });
  ok('other income added appears in list', (await page.$$('#view tbody tr')).length >= 1);

  // 11. manage accounts: add an account
  await goView('accounts', 'Manage Accounts');
  await clickAdd('Add account');
  await page.type('#a_name', 'Cash Box');
  await page.click('#saveAccount');
  await page.waitForFunction(() => !document.querySelector('.modal'), { timeout: 5000 });
  await page.waitForFunction(() => document.body.textContent.includes('Cash Box'), { timeout: 5000 });
  ok('account added', true);

  // 12. party ledger view + balance adjust button
  await goView('parties', 'Parties');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Ledger'), { timeout: 5000 });
  await page.evaluate(() => { Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Ledger').click(); });
  await page.waitForFunction(() => document.getElementById('tbTitle').textContent.startsWith('Ledger'), { timeout: 5000 });
  ok('ledger view open', true);
  ok('adjust balance button present', await page.evaluate(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Adjust balance'))));

  // 13. reports: vat & discount cards
  await goView('reports', 'Reports');
  await page.waitForSelector('#view .stats .stat', { timeout: 5000 });
  ok('reports stats', (await page.$$('#view .stats .stat')).length >= 5);
  ok('vat & discount cards present', await page.evaluate(() => document.body.textContent.includes('VAT collected') || document.body.textContent.includes('Discounts given')));

  // 14. staff
  await goView('staff', 'Staff');

  // 15. import data (submenu: import parties then import items)
  await goView('import_parties', 'Import Parties');
  await goView('import_items', 'Import Items');
  await page.waitForSelector('#view #impItems', { timeout: 5000 });
  ok('import items view has upload input', true);

  // 16. business tools submenu
  await goView('business_cards', 'Business Cards');
  await page.waitForSelector('#view #bc_party', { timeout: 5000 });
  ok('business card generator renders', true);
  await goView('greeting_cards', 'Greeting Cards');
  await page.waitForSelector('#view #gr_party', { timeout: 5000 });
  ok('greeting card templates present', await page.evaluate(() => !!document.querySelector('#view #gr_party')));
  await goView('reminders', 'Reminders');
  await goView('bill_gallery', 'Bill Gallery');
  ok('bill gallery upload present', await page.evaluate(() => !!document.querySelector('#view input[type=file]')));
  await goView('barcode', 'Barcode Generator');
  await page.waitForSelector('#view #bc_code', { timeout: 5000 });
  ok('barcode generator has value input', true);

  // 16b. submenu expand/collapse
  await page.click('.nav-parent[data-expands="sales"]');
  ok('sales submenu collapses on parent click', await page.evaluate(() => !document.getElementById('sub-sales').classList.contains('open')));
  await page.click('.nav-parent[data-expands="sales"]');

  // 17. refer & win
  await goView('refer', 'Refer & Win');
  ok('referral code shown', (await page.evaluate(() => document.body.textContent.includes('referral code'))));

  // 17. help & support
  await goView('help', 'Help & Support');

  // 18. tutorials
  await goView('tutorials', 'Tutorials');

  // 19. settings: invoice prefix, dark mode, font size, EMI calculator
  await goView('settings', 'Settings');
  ok('invoice prefix field present', await page.evaluate(() => !!document.getElementById('b_prefix')));
  await setVal('#b_prefix', 'INVX');
  await page.click('#view button.btn-primary');
  await page.waitForFunction(() => { const el = document.getElementById('b_prefix'); return el && el.value === 'INVX'; }, { timeout: 5000 });
  ok('appearance controls present', await page.evaluate(() => document.body.textContent.includes('Dark mode') && document.body.textContent.includes('Font size')));
  await page.evaluate(() => toggleDark());
  ok('dark mode toggles html class', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.evaluate(() => setFontSize(18));
  ok('font size applied', await page.evaluate(() => document.documentElement.style.fontSize === '18px'));
  await page.evaluate(() => emiModal());
  await page.waitForSelector('.modal #emi_p', { timeout: 5000 });
  await page.evaluate(() => calcEmi());
  ok('emi result computed', await page.evaluate(() => !!document.getElementById('emiResult').textContent.trim()));
  await page.evaluate(() => document.querySelector('.modal-backdrop [data-close]').click());

  // 20. dashboard daybook
  await goView('dashboard', 'Dashboard');
  await page.waitForFunction(() => document.body.textContent.includes('Daybook'), { timeout: 6000 });
  ok('daybook section present', true);

  await browser.close();
  if (errors.length) {
    console.log('\nCONSOLE/JS ERRORS:');
    errors.forEach(e => console.log('  ' + e));
  } else {
    console.log('\nNo JS errors detected.');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

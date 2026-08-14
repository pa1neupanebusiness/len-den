const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let db;
try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(path.join(DATA_DIR, 'lenden.db'));
} catch {
  const Database = require('better-sqlite3');
  db = new Database(path.join(DATA_DIR, 'lenden.db'));
}
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  currency TEXT DEFAULT 'NPR',
  fiscal_year_start TEXT DEFAULT '2025-04-01',
  invoice_prefix TEXT DEFAULT 'INV',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  phone TEXT NOT NULL,
  name TEXT DEFAULT '',
  role TEXT DEFAULT 'owner',
  is_owner INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('customer','supplier')),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  opening_balance REAL DEFAULT 0,
  note TEXT DEFAULT '',
  category TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  pay_type TEXT DEFAULT 'receive',
  as_of_date TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'pcs',
  category TEXT DEFAULT '',
  code TEXT DEFAULT '',
  type TEXT DEFAULT 'goods',
  purchase_price REAL DEFAULT 0,
  wholesale_price REAL DEFAULT 0,
  sale_price REAL DEFAULT 0,
  mrp REAL DEFAULT 0,
  stock REAL DEFAULT 0,
  low_stock REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sale','purchase','expense','payment_in','payment_out','other_income','quotation','sales_return','purchase_return')),
  date TEXT NOT NULL,
  party_id INTEGER,
  item_id INTEGER,
  quantity REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  discount REAL DEFAULT 0,
  vat_percent REAL DEFAULT 0,
  reminder_date TEXT DEFAULT '',
  payment_method TEXT DEFAULT '',
  note TEXT DEFAULT '',
  ref_no TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'other',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);
`);

/* Migrate existing databases: add other_income to the transactions CHECK constraint. */
const tcol = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'`).get();
if (tcol && tcol.sql && !tcol.sql.includes('other_income')) {
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN;');
  try {
    db.exec('ALTER TABLE transactions RENAME TO transactions_old;');
    db.exec(`CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('sale','purchase','expense','payment_in','payment_out','other_income')),
      date TEXT NOT NULL,
      party_id INTEGER,
      item_id INTEGER,
      quantity REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      discount REAL DEFAULT 0,
      vat_percent REAL DEFAULT 0,
      reminder_date TEXT DEFAULT '',
      payment_method TEXT DEFAULT '',
      note TEXT DEFAULT '',
      ref_no TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
    );`);
    db.exec(`INSERT INTO transactions (id, business_id, type, date, party_id, item_id, quantity, rate, amount, discount, vat_percent, reminder_date, payment_method, note, ref_no, created_at)
      SELECT id, business_id, type, date, party_id, item_id, quantity, rate, amount, 0, 0, '', payment_method, note, '', created_at FROM transactions_old;`);
    db.exec('DROP TABLE transactions_old;');
    db.exec('COMMIT;');
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }
  db.exec('PRAGMA foreign_keys = ON;');
}

/* Migrate existing databases: add the Sales/Purchase sub-menu transaction types. */
function rebuildTransactions(sql) {
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN;');
  try {
    db.exec('ALTER TABLE transactions RENAME TO transactions_old;');
    db.exec(`CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('sale','purchase','expense','payment_in','payment_out','other_income','quotation','sales_return','purchase_return')),
      date TEXT NOT NULL,
      party_id INTEGER,
      item_id INTEGER,
      quantity REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      discount REAL DEFAULT 0,
      vat_percent REAL DEFAULT 0,
      reminder_date TEXT DEFAULT '',
      payment_method TEXT DEFAULT '',
      note TEXT DEFAULT '',
      ref_no TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
    );`);
    db.exec(`INSERT INTO transactions (id, business_id, type, date, party_id, item_id, quantity, rate, amount, discount, vat_percent, reminder_date, payment_method, note, ref_no, created_at)
      SELECT id, business_id, type, date, party_id, item_id, quantity, rate, amount, discount, vat_percent, reminder_date, payment_method, note, ref_no, created_at FROM transactions_old;`);
    db.exec('DROP TABLE transactions_old;');
    db.exec('COMMIT;');
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }
  db.exec('PRAGMA foreign_keys = ON;');
}

const tcur = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'`).get();
if (tcur && tcur.sql && !tcur.sql.includes('quotation')) rebuildTransactions(tcur.sql);

/* Migrate existing databases: add newer columns if missing. */
function hasCol(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
}
if (!hasCol('businesses', 'invoice_prefix')) db.exec("ALTER TABLE businesses ADD COLUMN invoice_prefix TEXT DEFAULT 'INV'");
if (!hasCol('parties', 'category')) db.exec("ALTER TABLE parties ADD COLUMN category TEXT DEFAULT ''");
if (!hasCol('parties', 'photo')) db.exec("ALTER TABLE parties ADD COLUMN photo TEXT DEFAULT ''");
if (!hasCol('parties', 'pay_type')) db.exec("ALTER TABLE parties ADD COLUMN pay_type TEXT DEFAULT 'receive'");
if (!hasCol('parties', 'as_of_date')) db.exec("ALTER TABLE parties ADD COLUMN as_of_date TEXT DEFAULT ''");
if (!hasCol('items', 'category')) db.exec("ALTER TABLE items ADD COLUMN category TEXT DEFAULT ''");
if (!hasCol('items', 'code')) db.exec("ALTER TABLE items ADD COLUMN code TEXT DEFAULT ''");
if (!hasCol('items', 'type')) db.exec("ALTER TABLE items ADD COLUMN type TEXT DEFAULT 'goods'");
if (!hasCol('items', 'wholesale_price')) db.exec('ALTER TABLE items ADD COLUMN wholesale_price REAL DEFAULT 0');
if (!hasCol('items', 'mrp')) db.exec('ALTER TABLE items ADD COLUMN mrp REAL DEFAULT 0');
if (!hasCol('transactions', 'discount')) db.exec('ALTER TABLE transactions ADD COLUMN discount REAL DEFAULT 0');
if (!hasCol('transactions', 'vat_percent')) db.exec('ALTER TABLE transactions ADD COLUMN vat_percent REAL DEFAULT 0');
if (!hasCol('transactions', 'reminder_date')) db.exec("ALTER TABLE transactions ADD COLUMN reminder_date TEXT DEFAULT ''");
if (!hasCol('transactions', 'ref_no')) db.exec("ALTER TABLE transactions ADD COLUMN ref_no TEXT DEFAULT ''");
if (!hasCol('users', 'email')) db.exec("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''");
if (!hasCol('users', 'google_id')) db.exec("ALTER TABLE users ADD COLUMN google_id TEXT DEFAULT ''");
if (!hasCol('accounts', 'balance')) db.exec('ALTER TABLE accounts ADD COLUMN balance REAL DEFAULT 0');
if (!hasCol('transactions', 'paid_amount')) db.exec('ALTER TABLE transactions ADD COLUMN paid_amount REAL DEFAULT 0');
if (!hasCol('transactions', 'due_amount')) db.exec('ALTER TABLE transactions ADD COLUMN due_amount REAL DEFAULT 0');
if (!hasCol('transactions', 'payment_status')) db.exec("ALTER TABLE transactions ADD COLUMN payment_status TEXT DEFAULT 'paid'");
if (!hasCol('transactions', 'linked_txn_id')) db.exec('ALTER TABLE transactions ADD COLUMN linked_txn_id INTEGER DEFAULT NULL');

/* Backfill existing sale/purchase transactions with due tracking. */
db.exec(`UPDATE transactions SET payment_status = 'paid', paid_amount = amount, due_amount = 0
  WHERE type IN ('sale','purchase') AND (payment_status IS NULL OR payment_status = '' OR payment_status = 'paid') AND paid_amount = 0 AND due_amount = 0;`);
db.exec(`UPDATE transactions SET paid_amount = amount, due_amount = 0, payment_status = 'paid'
  WHERE type IN ('payment_in','payment_out','sales_return','purchase_return','expense','other_income','quotation')
  AND (paid_amount = 0 OR paid_amount IS NULL);`);

/* Backfill transaction reference numbers. */
db.exec(`UPDATE transactions SET ref_no = (SELECT COALESCE(b.invoice_prefix,'INV') FROM businesses b WHERE b.id = transactions.business_id) || '-' || printf('%06d', transactions.id)
  WHERE ref_no IS NULL OR ref_no = '';`);

db.exec(`CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  due_at TEXT NOT NULL,
  type TEXT DEFAULT 'task',
  done INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);`);

db.exec(`
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  entry_date TEXT NOT NULL,
  reference TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS emis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  emi_number TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  party_id INTEGER NOT NULL,
  quantity REAL DEFAULT 1,
  product_total REAL NOT NULL,
  down_payment REAL DEFAULT 0,
  net_amount REAL NOT NULL,
  remaining_amount REAL NOT NULL,
  total_paid REAL DEFAULT 0,
  interest_rate REAL DEFAULT 0,
  paid_status TEXT DEFAULT 'pending',
  payment_method TEXT DEFAULT 'cash',
  bank_name TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS emi_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emi_id INTEGER NOT NULL,
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL,
  principal REAL NOT NULL,
  interest REAL NOT NULL,
  method TEXT DEFAULT 'cash',
  reference TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (emi_id) REFERENCES emis(id) ON DELETE CASCADE
);`);

function begin() {
  db.exec('BEGIN');
}
function commit() {
  db.exec('COMMIT');
}
function rollback() {
  db.exec('ROLLBACK');
}

function getBusiness(id) {
  return db.prepare('SELECT * FROM businesses WHERE id = ?').get(id);
}
function getUserByToken(token) {
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s) return null;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id);
  if (!u) return null;
  const b = getBusiness(u.business_id);
  return { user: u, business: b };
}

module.exports = { db, begin, commit, rollback, getBusiness, getUserByToken };

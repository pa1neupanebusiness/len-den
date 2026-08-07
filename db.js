const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'lenden.db'));
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
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'pcs',
  purchase_price REAL DEFAULT 0,
  sale_price REAL DEFAULT 0,
  stock REAL DEFAULT 0,
  low_stock REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sale','purchase','expense','payment_in','payment_out')),
  date TEXT NOT NULL,
  party_id INTEGER,
  item_id INTEGER,
  quantity REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
);
`);

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

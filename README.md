# Len Den

A fully working business management (khata) web app — inspired by Karobar's feature set.
Record sales, purchases and expenses, maintain customer & supplier ledgers, track inventory,
view reports, manage staff, and backup your data. Runs 100% locally.

## Quick start

Requires [Node.js](https://nodejs.org) v22.5+ (uses the built-in `node:sqlite`).

```
npm install
npm start
```

Then open http://localhost:3000 in your browser.

### Login

- Enter any 10-digit Nepali phone number (e.g. `9840000000`) and press **Continue**.
- The verification code is shown on screen (demo mode) — type it and log in.
- A fresh business is auto-created for each new phone number.

## Features

| Module | What it does |
|---|---|
| Dashboard | Today's sales/purchases/expenses, net cash, receivable & payable, monthly profit, sales chart, low-stock alerts, recent transactions |
| Transactions (Khata) | Add sale, purchase, expense, payment received, payment made. Filter by type/party/item/date, search, edit & delete (stock adjusts automatically) |
| Parties | Customers & suppliers with opening balance, phone, address. Live balance per party |
| Ledger | Per-party running ledger (khata) with opening/closing balance and every entry |
| Inventory | Items with buy/sell price, units, stock and low-stock alerts. Stock updates from transactions |
| Reports | Period totals (sales/purchases/expenses/profit), top items, top customers, expense breakdown |
| Staff | Add/remove staff members who can log in with their own phone |
| Settings | Business profile, currency, fiscal year, JSON backup & restore, reset data |

## Data & storage

Everything is stored locally in `data/lenden.db` (SQLite). Nothing leaves your machine.
Use **Settings → Backup & restore** to export/import a JSON copy of all your data.

## Project structure

```
len-den/
  server.js          Express server + all API routes
  db.js              SQLite schema & helpers (node:sqlite)
  public/
    login.html       Phone + OTP login screen
    app.html         App shell (sidebar, topbar)
    css/app.css      Design system
    js/app.js        SPA: views for every module
  test/ui-test.js    End-to-end smoke test (runs in headless Chrome)
  data/              SQLite database (auto-created)
```

## Tests

`npm test` runs an end-to-end browser test against a running server
(it drives your installed Chrome via puppeteer-core).

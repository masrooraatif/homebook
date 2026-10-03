# Homebook

A household income and expense dashboard. Node.js + Express on the server, MySQL for storage,
and a mobile-first web app you can install on your phone. No build step.

**What you get**

- Dashboard: what is left this month, a bar showing where the income went, category donut,
  six-month trend, budget progress and recent entries
- Income and spending entries with categories (rent, loans and EMI, groceries, electricity and water,
  internet, household help, transport, health, education, insurance and more)
- Monthly repeats for rent, salary and bills, added to each month with one tap
- Budgets per category, with warnings at 80% and when over
- Search and filter, edit and delete, CSV export, currency setting
- Installable on Android and iOS (Add to Home Screen), light and dark mode
- Optional single-password login

## Requirements

- Node.js 20.6 or newer
- MySQL 8 (MariaDB 10.5+ also works)

## Set up

```bash
npm install
cp .env.example .env        # then edit DB_USER and DB_PASSWORD
npm run db:init             # creates the database, tables and categories
npm run db:seed             # optional: six months of sample data
npm start
```

Open http://localhost:3000.

To use it from your phone on the same Wi-Fi, open `http://<your-computer-ip>:3000` in the phone's browser.
To install it like an app the page must be served over HTTPS (any host with a certificate works, for
example a small VPS behind Caddy or nginx). Set `TRUST_PROXY=1` when behind a proxy.

If you would rather create the database yourself:

```bash
mysql -u root -p -e "CREATE DATABASE homebook CHARACTER SET utf8mb4"
mysql -u root -p homebook < schema.sql
```

## Password protection

Set `APP_PASSWORD` and `SESSION_SECRET` in `.env`. Everyone using the app shares that one password.
This is built for one household, not for separate user accounts.

## Project layout

```
server.js        Express app, security headers, error handling
routes.js        JSON API (summary, transactions, budgets, repeats, export)
auth.js          Optional password login with signed cookie
db.js            MySQL connection pool (mysql2)
demo.js          Sample data used by db:seed and the "Load sample data" button
schema.sql       Tables and default categories
public/          The web app (index.html, styles.css, app.js, service worker, manifest)
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/summary?month=2026-09` | Totals, categories, six-month trend, budgets, pending repeats |
| GET | `/api/transactions?month=&type=&category=&q=` | List entries |
| POST / PUT / DELETE | `/api/transactions[/:id]` | Create (with optional `repeat`), edit, delete |
| GET / PUT | `/api/budgets`, `/api/budgets/:categoryId` | Monthly budgets |
| GET / DELETE | `/api/recurring[/:id]` | Monthly repeats |
| POST | `/api/recurring/apply` | Add this month's pending repeats |
| GET | `/api/export.csv` | Download all entries |

All queries use placeholders, so user input never goes into SQL text.

## Changing categories

Categories live in the `categories` table (see `schema.sql`). Add rows with a name, `income` or `expense`,
and a hex colour, and they appear in the app straight away.


## New features

- Custom income/spending categories from **Settings → Categories**.
- Monthly category spending limits from **Budgets**.
- Optional email alert when a category crosses its monthly limit. Configure SMTP in `.env`.
- Formatted `.xlsx` Excel export with Transactions, Budgets and Monthly Summary sheets.
- Responsive dashboard with subtle 3D card/entry animations; respects reduced-motion preferences.

### Budget email setup

Copy `.env.example` to `.env` and set:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your@gmail.com
EMAIL_PASS=your-gmail-app-password
EMAIL_FROM=your@gmail.com
BUDGET_ALERT_TO=your@gmail.com
```

For Gmail, use a Google **App Password** rather than your normal account password. Email alerts are sent once per category per month after the limit is crossed.

After changing the schema, run:

```bash
npm install
npm run db:init
npm run dev
```

The Excel export is available from **Settings → Your data → Download Excel**.
"# homebook" 

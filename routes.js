import { Router } from 'express';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import { pool } from './db.js';
import { loadDemo } from './demo.js';
import {
  addMonths, currentMonth, daysInMonth, httpError, isDate, isMonth, monthRange, num, pad, today,
} from './util.js';

const api = Router();

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'];

const mailer = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS
  ? nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT ?? 587),
      secure: String(process.env.EMAIL_SECURE).toLowerCase() === 'true',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    })
  : null;

function slugifyCategory(name) {
  return String(name).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

async function maybeSendBudgetAlert(categoryId, month) {
  if (!mailer || !process.env.BUDGET_ALERT_TO) return false;
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.color, b.amount AS budget,
            COALESCE(SUM(CASE WHEN t.type='expense' AND t.tx_date >= ? AND t.tx_date < ? THEN t.amount ELSE 0 END), 0) AS spent
       FROM categories c
       JOIN budgets b ON b.category_id = c.id
       LEFT JOIN transactions t ON t.category_id = c.id
      WHERE c.id = ? AND c.type='expense'
      GROUP BY c.id, c.name, c.color, b.amount`,
    [`${month}-01`, `${addMonths(month, 1)}-01`, categoryId],
  );
  if (!rows.length) return false;
  const budget = num(rows[0].budget);
  const spent = num(rows[0].spent);
  if (!(budget > 0 && spent > budget)) return false;

  const [already] = await pool.query(
    'SELECT id FROM budget_alerts WHERE category_id = ? AND month = ? LIMIT 1',
    [categoryId, month],
  );
  if (already.length) return false;

  await pool.query(
    'INSERT INTO budget_alerts (category_id, month, budget, spent) VALUES (?,?,?,?)',
    [categoryId, month, budget, spent],
  );

  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const currency = (await pool.query("SELECT v FROM settings WHERE k='currency'"))[0]?.[0]?.v || 'INR';
  const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency });
  await mailer.sendMail({
    from,
    to: process.env.BUDGET_ALERT_TO,
    subject: `Homebook budget alert: ${rows[0].name}`,
    text: [
      `Budget limit exceeded for ${rows[0].name}.`,
      `Month: ${month}`,
      `Limit: ${money.format(budget)}`,
      `Spent: ${money.format(spent)}`,
      `Over by: ${money.format(spent - budget)}`,
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;padding:24px;border:1px solid #e2e6ee;border-radius:16px">
      <h2 style="margin:0 0 12px;color:#14213d">Homebook Budget Alert</h2>
      <p>Your <b>${rows[0].name}</b> spending limit has been exceeded.</p>
      <p><b>Month:</b> ${month}<br><b>Limit:</b> ${money.format(budget)}<br><b>Spent:</b> ${money.format(spent)}<br><b>Over by:</b> ${money.format(spent - budget)}</p>
    </div>`,
  });
  return true;
}


/* ---------- helpers ---------- */

async function withTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function monthParam(v) {
  if (v === undefined || v === '') return currentMonth();
  if (!isMonth(v)) throw httpError(400, 'Month must look like 2026-09.');
  return v;
}

function idParam(v) {
  const id = Number.parseInt(v, 10);
  if (!Number.isSafeInteger(id) || id < 1) throw httpError(400, 'Invalid id.');
  return id;
}

function parseEntry(b = {}) {
  if (!['income', 'expense'].includes(b.type)) throw httpError(400, 'Choose income or spending.');
  const category_id = Number.parseInt(b.category_id, 10);
  if (!Number.isInteger(category_id)) throw httpError(400, 'Choose a category.');
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!(amount > 0) || amount >= 1e10) throw httpError(400, 'Enter an amount greater than zero.');
  if (!isDate(b.date)) throw httpError(400, 'Enter a valid date.');
  const note = String(b.note ?? '').trim().slice(0, 255);
  return { type: b.type, category_id, amount, date: b.date, note };
}

async function assertCategory(id, type) {
  const [rows] = await pool.query('SELECT type FROM categories WHERE id = ?', [id]);
  if (!rows.length || rows[0].type !== type) {
    throw httpError(400, 'That category does not match the entry type.');
  }
}

const monthlyDate = (month, day) => `${month}-${pad(Math.min(day, daysInMonth(month)))}`;

const PENDING_SQL = `
  SELECT r.id, r.type, r.category_id, r.amount, r.note, r.day_of_month,
         c.name AS category, c.color
    FROM recurring r
    JOIN categories c ON c.id = r.category_id
   WHERE r.start_month <= ?
     AND NOT EXISTS (
       SELECT 1 FROM transactions t
        WHERE t.recurring_id = r.id AND t.tx_date >= ? AND t.tx_date < ?)
   ORDER BY r.day_of_month`;

async function pendingRecurring(conn, month) {
  const [start, next] = monthRange(month);
  const [rows] = await conn.query(PENDING_SQL, [month, start, next]);
  return rows.map((r) => ({ ...r, amount: num(r.amount) }));
}

async function budgetRows(month) {
  const [start, next] = monthRange(month);
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.color, COALESCE(b.amount, 0) AS budget, COALESCE(s.spent, 0) AS spent
       FROM categories c
       LEFT JOIN budgets b ON b.category_id = c.id
       LEFT JOIN (
         SELECT category_id, SUM(amount) AS spent
           FROM transactions
          WHERE type = 'expense' AND tx_date >= ? AND tx_date < ?
          GROUP BY category_id) s ON s.category_id = c.id
      WHERE c.type = 'expense'
      ORDER BY c.sort_order, c.name`,
    [start, next],
  );
  return rows.map((r) => ({ ...r, budget: num(r.budget), spent: num(r.spent) }));
}

const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/* ---------- categories ---------- */

api.post('/categories', async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 80);
  const type = req.body?.type;
  const color = /^#[0-9A-Fa-f]{6}$/.test(req.body?.color) ? req.body.color : '#2B45D4';
  if (name.length < 2) throw httpError(400, 'Category name must be at least 2 characters.');
  if (!['income', 'expense'].includes(type)) throw httpError(400, 'Choose income or spending.');
  const base = slugifyCategory(name);
  if (!base) throw httpError(400, 'Choose a valid category name.');
  const [exists] = await pool.query('SELECT id FROM categories WHERE name = ? OR slug = ? LIMIT 1', [name, base]);
  if (exists.length) throw httpError(409, 'That category already exists.');
  const [maxRows] = await pool.query('SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM categories WHERE type = ?', [type]);
  const sortOrder = Number(maxRows[0].maxOrder) + 1;
  const [r] = await pool.query(
    'INSERT INTO categories (slug,name,type,color,sort_order) VALUES (?,?,?,?,?)',
    [base, name, type, color, sortOrder],
  );
  res.status(201).json({ id: r.insertId, slug: base, name, type, color });
});

/* ---------- meta and settings ---------- */

api.get('/meta', async (req, res) => {
  const [categories] = await pool.query(
    'SELECT id, slug, name, type, color FROM categories ORDER BY type, sort_order, name',
  );
  const [settings] = await pool.query("SELECT v FROM settings WHERE k = 'currency'");
  const [any] = await pool.query('SELECT 1 FROM transactions LIMIT 1');
  res.json({
    categories,
    currency: settings[0]?.v ?? 'INR',
    currencies: CURRENCIES,
    hasData: any.length > 0,
    budgetEmailEnabled: Boolean(mailer && process.env.BUDGET_ALERT_TO),
  });
});

api.put('/settings', async (req, res) => {
  const currency = req.body?.currency;
  if (!CURRENCIES.includes(currency)) throw httpError(400, 'Unsupported currency.');
  await pool.query(
    "INSERT INTO settings (k, v) VALUES ('currency', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
    [currency],
  );
  res.json({ currency });
});

/* ---------- dashboard summary ---------- */

api.get('/summary', async (req, res) => {
  const month = monthParam(req.query.month);
  const [start, next] = monthRange(month);
  const trendStart = `${addMonths(month, -11)}-01`;

  const [catRows] = await pool.query(
    `SELECT c.id, c.name, c.color, c.type, SUM(t.amount) AS total, COUNT(*) AS entries
       FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.tx_date >= ? AND t.tx_date < ?
      GROUP BY c.id ORDER BY total DESC`,
    [start, next],
  );

  const [trendRows] = await pool.query(
    `SELECT DATE_FORMAT(tx_date, '%Y-%m') AS ym, type, SUM(amount) AS total
       FROM transactions WHERE tx_date >= ? AND tx_date < ?
      GROUP BY ym, type`,
    [trendStart, next],
  );

  const trend = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(month, i - 11);
    const pick = (type) => num(trendRows.find((r) => r.ym === m && r.type === type)?.total);
    return { month: m, income: pick('income'), expense: pick('expense') };
  });

  const current = trend[11];
  const previous = trend[10];
  const shape = (rows, type, total) =>
    rows.filter((r) => r.type === type).map((r) => ({
      id: r.id, name: r.name, color: r.color, total: num(r.total), entries: num(r.entries),
      share: total > 0 ? num(r.total) / total : 0,
    }));

  const [any] = await pool.query('SELECT 1 FROM transactions LIMIT 1');

  res.json({
    month,
    income: current.income,
    expense: current.expense,
    balance: current.income - current.expense,
    savingsRate: current.income > 0 ? (current.income - current.expense) / current.income : null,
    previous: { month: previous.month, income: previous.income, expense: previous.expense },
    categories: shape(catRows, 'expense', current.expense),
    incomeSources: shape(catRows, 'income', current.income),
    trend,
    budgets: (await budgetRows(month)).filter((b) => b.budget > 0),
    pendingRecurring: await pendingRecurring(pool, month),
    hasData: any.length > 0,
  });
});

/* ---------- transactions ---------- */

api.get('/transactions', async (req, res) => {
  const where = [];
  const args = [];
  if (req.query.month) {
    const [start, next] = monthRange(monthParam(req.query.month));
    where.push('t.tx_date >= ? AND t.tx_date < ?');
    args.push(start, next);
  }
  if (['income', 'expense'].includes(req.query.type)) {
    where.push('t.type = ?');
    args.push(req.query.type);
  }
  if (req.query.category) {
    where.push('t.category_id = ?');
    args.push(idParam(req.query.category));
  }
  const q = String(req.query.q ?? '').trim().slice(0, 80);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push('(t.note LIKE ? OR c.name LIKE ?)');
    args.push(like, like);
  }
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 500, 1), 1000);

  const [rows] = await pool.query(
    `SELECT t.id, t.type, t.category_id, c.name AS category, c.color, t.amount,
            t.tx_date AS date, t.note, t.recurring_id
       FROM transactions t JOIN categories c ON c.id = t.category_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY t.tx_date DESC, t.id DESC
      LIMIT ?`,
    [...args, limit],
  );
  res.json(rows.map((r) => ({ ...r, amount: num(r.amount) })));
});

api.post('/transactions', async (req, res) => {
  const t = parseEntry(req.body);
  await assertCategory(t.category_id, t.type);
  const id = await withTx(async (conn) => {
    let recurringId = null;
    if (req.body.repeat) {
      const [r] = await conn.query(
        `INSERT INTO recurring (type, category_id, amount, day_of_month, note, start_month)
         VALUES (?,?,?,?,?,?)`,
        [t.type, t.category_id, t.amount, Number(t.date.slice(8, 10)), t.note, t.date.slice(0, 7)],
      );
      recurringId = r.insertId;
    }
    const [tr] = await conn.query(
      `INSERT INTO transactions (type, category_id, amount, tx_date, note, recurring_id)
       VALUES (?,?,?,?,?,?)`,
      [t.type, t.category_id, t.amount, t.date, t.note, recurringId],
    );
    return { id: tr.insertId, month: t.date.slice(0, 7), categoryId: t.category_id };
  });
  try { await maybeSendBudgetAlert(id.categoryId, id.month); } catch (mailErr) {
    console.error('Budget alert email failed:', mailErr.message);
  }
  res.status(201).json({ id: id.id });
});

api.put('/transactions/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const t = parseEntry(req.body);
  await assertCategory(t.category_id, t.type);
  const [r] = await pool.query(
    'UPDATE transactions SET type=?, category_id=?, amount=?, tx_date=?, note=? WHERE id=?',
    [t.type, t.category_id, t.amount, t.date, t.note, id],
  );
  if (r.affectedRows === 0) throw httpError(404, 'That entry no longer exists.');
  try { await maybeSendBudgetAlert(t.category_id, t.date.slice(0, 7)); } catch (mailErr) {
    console.error('Budget alert email failed:', mailErr.message);
  }
  res.json({ id });
});

api.delete('/transactions/:id', async (req, res) => {
  const [r] = await pool.query('DELETE FROM transactions WHERE id = ?', [idParam(req.params.id)]);
  if (r.affectedRows === 0) throw httpError(404, 'That entry no longer exists.');
  res.status(204).end();
});

/* ---------- budgets ---------- */

api.get('/budgets', async (req, res) => {
  res.json(await budgetRows(monthParam(req.query.month)));
});

api.put('/budgets/:categoryId', async (req, res) => {
  const categoryId = idParam(req.params.categoryId);
  const amount = Math.round(Number(req.body?.amount ?? 0) * 100) / 100;
  if (!(amount >= 0) || amount >= 1e10) throw httpError(400, 'Enter a budget of zero or more.');
  const [cat] = await pool.query("SELECT 1 FROM categories WHERE id = ? AND type = 'expense'", [categoryId]);
  if (!cat.length) throw httpError(400, 'Budgets can only be set for spending categories.');
  if (amount === 0) {
    await pool.query('DELETE FROM budgets WHERE category_id = ?', [categoryId]);
  } else {
    await pool.query(
      'INSERT INTO budgets (category_id, amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount)',
      [categoryId, amount],
    );
  }
  await pool.query('DELETE FROM budget_alerts WHERE category_id = ?', [categoryId]);
  try { await maybeSendBudgetAlert(categoryId, currentMonth()); } catch (mailErr) {
    console.error('Budget alert email failed:', mailErr.message);
  }
  res.json({ category_id: categoryId, amount });
});

/* ---------- monthly repeats ---------- */

api.get('/recurring', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.id, r.type, r.amount, r.day_of_month, r.note, r.start_month, c.name AS category, c.color
       FROM recurring r JOIN categories c ON c.id = r.category_id
      ORDER BY r.type, r.day_of_month`,
  );
  res.json(rows.map((r) => ({ ...r, amount: num(r.amount) })));
});

api.post('/recurring/apply', async (req, res) => {
  const month = monthParam(req.body?.month);
  const added = await withTx(async (conn) => {
    const pending = await pendingRecurring(conn, month);
    if (!pending.length) return { count: 0, categoryIds: [] };
    const rows = pending.map((p) => [
      p.type, p.category_id, p.amount, monthlyDate(month, p.day_of_month), p.note, p.id,
    ]);
    await conn.query(
      'INSERT INTO transactions (type, category_id, amount, tx_date, note, recurring_id) VALUES ?',
      [rows],
    );
    return { count: rows.length, categoryIds: [...new Set(pending.filter((p) => p.type === 'expense').map((p) => p.category_id))] };
  });
  for (const categoryId of added.categoryIds) {
    try { await maybeSendBudgetAlert(categoryId, month); } catch (mailErr) {
      console.error('Budget alert email failed:', mailErr.message);
    }
  }
  res.json({ added: added.count });
});

api.delete('/recurring/:id', async (req, res) => {
  await pool.query('DELETE FROM recurring WHERE id = ?', [idParam(req.params.id)]);
  res.status(204).end();
});

/* ---------- exports, sample data, reset ---------- */

api.get('/export.xlsx', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.tx_date AS date, t.type, c.name AS category, t.amount, t.note
       FROM transactions t JOIN categories c ON c.id = t.category_id
      ORDER BY t.tx_date, t.id`,
  );
  const [budgetRowsAll] = await pool.query(
    `SELECT c.name, c.type, c.color, COALESCE(b.amount,0) AS budget,
            COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) AS spent
       FROM categories c
       LEFT JOIN budgets b ON b.category_id=c.id
       LEFT JOIN transactions t ON t.category_id=c.id
      GROUP BY c.id, c.name, c.type, c.color, b.amount
      ORDER BY c.type, c.sort_order, c.name`,
  );
  const [summaryRows] = await pool.query(
    `SELECT DATE_FORMAT(tx_date,'%Y-%m') AS month,
            SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
            SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense
       FROM transactions GROUP BY month ORDER BY month`,
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Homebook';
  wb.created = new Date();
  wb.properties.title = 'Homebook Financial Report';

  const header = (ws) => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '14213D' } };
    ws.getRow(1).alignment = { vertical: 'middle' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: ws.getRow(1).getCell(ws.columnCount).address };
  };

  const txWs = wb.addWorksheet('Transactions');
  txWs.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Category', key: 'category', width: 28 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Note', key: 'note', width: 42 },
  ];
  rows.forEach((r) => txWs.addRow({ ...r, amount: num(r.amount) }));
  txWs.getColumn('date').numFmt = 'yyyy-mm-dd';
  txWs.getColumn('amount').numFmt = '#,##0.00';
  header(txWs);

  const bWs = wb.addWorksheet('Budgets');
  bWs.columns = [
    { header: 'Category', key: 'name', width: 30 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Limit', key: 'budget', width: 16 },
    { header: 'Spent', key: 'spent', width: 16 },
    { header: 'Status', key: 'status', width: 18 },
  ];
  budgetRowsAll.forEach((r) => {
    const budget = num(r.budget), spent = num(r.spent);
    bWs.addRow({ name:r.name, type:r.type, budget, spent, status: budget > 0 ? (spent > budget ? 'OVER LIMIT' : 'Within limit') : 'No limit' });
  });
  bWs.getColumn('budget').numFmt = '#,##0.00';
  bWs.getColumn('spent').numFmt = '#,##0.00';
  header(bWs);

  const sWs = wb.addWorksheet('Monthly Summary');
  sWs.columns = [
    { header: 'Month', key: 'month', width: 16 },
    { header: 'Income', key: 'income', width: 18 },
    { header: 'Expense', key: 'expense', width: 18 },
    { header: 'Balance', key: 'balance', width: 18 },
  ];
  summaryRows.forEach((r) => {
    const income = num(r.income), expense = num(r.expense);
    sWs.addRow({ month:r.month, income, expense, balance:income-expense });
  });
  for (const c of ['income','expense','balance']) sWs.getColumn(c).numFmt = '#,##0.00';
  header(sWs);

  const out = await wb.xlsx.writeBuffer();
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="homebook-${today()}.xlsx"`,
  });
  res.send(Buffer.from(out));
});

api.get('/export.csv', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.tx_date, t.type, c.name AS category, t.amount, t.note
       FROM transactions t JOIN categories c ON c.id = t.category_id
      ORDER BY t.tx_date, t.id`,
  );
  const lines = ['Date,Type,Category,Amount,Note'];
  for (const r of rows) {
    lines.push([r.tx_date, r.type, r.category, num(r.amount).toFixed(2), r.note].map(csvCell).join(','));
  }
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="homebook-${today()}.csv"`,
  });
  res.send(`\uFEFF${lines.join('\r\n')}\r\n`);
});

api.post('/demo', async (req, res) => {
  const [any] = await pool.query('SELECT 1 FROM transactions LIMIT 1');
  if (any.length) throw httpError(409, 'Sample data can only be added to an empty book.');
  res.status(201).json({ added: await loadDemo() });
});

api.delete('/data', async (req, res) => {
  if (req.body?.confirm !== true) throw httpError(400, 'Confirmation is required.');
  await withTx(async (conn) => {
    await conn.query('DELETE FROM transactions');
    await conn.query('DELETE FROM recurring');
    await conn.query('DELETE FROM budgets');
    await conn.query('DELETE FROM budget_alerts');
  });
  res.status(204).end();
});

export default api;

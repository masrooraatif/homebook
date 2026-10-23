import { Router } from 'express';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import { pool } from './db.js';
import { loadDemo } from './demo.js';
import {
  addMonths, currentMonth, daysInMonth, httpError, isDate, isMonth, monthRange, num, pad, today,
} from './util.js';

const api = Router();

// Goals table is created automatically so existing databases need no manual migration.
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS goals (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(80)   NOT NULL,
    target     DECIMAL(12,2) NOT NULL,
    saved      DECIMAL(12,2) NOT NULL DEFAULT 0,
    color      CHAR(7)       NOT NULL DEFAULT '#2F52E0',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
} catch (err) {
  console.error('Could not create goals table:', err.message);
}

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
    `SELECT c.id, c.name, c.color, c.parent_id, COALESCE(b.amount, 0) AS budget,
            COALESCE((SELECT SUM(t.amount)
                        FROM transactions t
                        JOIN categories tc ON tc.id = t.category_id
                       WHERE t.type = 'expense' AND t.tx_date >= ? AND t.tx_date < ?
                         AND (tc.id = c.id OR tc.parent_id = c.id)), 0) AS spent
       FROM categories c
       LEFT JOIN budgets b ON b.category_id = c.id
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

/* ---------- categories (with sub-categories) ---------- */

api.post('/categories', async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 80);
  let type = req.body?.type;
  const color = /^#[0-9A-Fa-f]{6}$/.test(req.body?.color) ? req.body.color : '#2B45D4';
  if (name.length < 2) throw httpError(400, 'Category name must be at least 2 characters.');

  // optional parent: makes this a sub-category
  let parentId = null;
  const rawParent = req.body?.parent_id;
  if (rawParent !== undefined && rawParent !== null && rawParent !== '') {
    parentId = idParam(rawParent);
    const [p] = await pool.query('SELECT id, type, parent_id FROM categories WHERE id = ?', [parentId]);
    if (!p.length) throw httpError(400, 'Parent category not found.');
    if (p[0].parent_id) throw httpError(400, 'A sub-category cannot have its own sub-categories.');
    type = p[0].type; // a sub-category always uses its parent's type
  }
  if (!['income', 'expense'].includes(type)) throw httpError(400, 'Choose income or spending.');

  const clean = slugifyCategory(name);
  if (!clean) throw httpError(400, 'Choose a valid category name.');
  const slug = parentId ? `${clean.slice(0, 30)}_p${parentId}` : clean;

  const [exists] = parentId
    ? await pool.query(
        'SELECT id FROM categories WHERE parent_id = ? AND (name = ? OR slug = ?) LIMIT 1',
        [parentId, name, slug],
      )
    : await pool.query(
        'SELECT id FROM categories WHERE (name = ? AND parent_id IS NULL) OR slug = ? LIMIT 1',
        [name, slug],
      );
  if (exists.length) throw httpError(409, 'That category already exists.');

  const [maxRows] = await pool.query('SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM categories WHERE type = ?', [type]);
  const sortOrder = Number(maxRows[0].maxOrder) + 1;
  const [r] = await pool.query(
    'INSERT INTO categories (slug,name,type,color,sort_order,parent_id) VALUES (?,?,?,?,?,?)',
    [slug, name, type, color, sortOrder, parentId],
  );
  res.status(201).json({ id: r.insertId, slug, name, type, color, parent_id: parentId });
});

/* ---------- quick add: your most repeated spending ---------- */

api.get('/quick', async (req, res) => {
  const since = `${addMonths(currentMonth(), -3)}-01`;
  const [rows] = await pool.query(
    `SELECT t.type, t.category_id, t.amount, t.note,
            CONCAT_WS(' › ', p.name, c.name) AS category, c.color,
            COUNT(*) AS n, MAX(t.tx_date) AS last_date
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
      WHERE t.type = 'expense' AND t.tx_date >= ? AND t.recurring_id IS NULL
      GROUP BY t.type, t.category_id, t.amount, t.note, c.name, p.name, c.color
     HAVING n >= 2
      ORDER BY n DESC, last_date DESC
      LIMIT 6`,
    [since],
  );
  res.json(rows.map((r) => ({
    type: r.type, category_id: r.category_id, amount: num(r.amount), note: r.note,
    category: r.category, color: r.color, count: num(r.n),
  })));
});

/* ---------- yearly report ---------- */

api.get('/report', async (req, res) => {
  const thisYear = Number(currentMonth().slice(0, 4));
  const year = req.query.year ? Number.parseInt(req.query.year, 10) : thisYear;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw httpError(400, 'Choose a valid year.');

  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.color, c.type, c.parent_id,
            p.name AS parent_name, p.color AS parent_color,
            MONTH(t.tx_date) AS m, SUM(t.amount) AS total
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
      WHERE t.tx_date >= ? AND t.tx_date < ?
      GROUP BY c.id, m`,
    [`${year}-01-01`, `${year + 1}-01-01`],
  );
  const [yearRows] = await pool.query('SELECT DISTINCT YEAR(tx_date) AS y FROM transactions ORDER BY y DESC');

  const months = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${pad(i + 1)}`, income: 0, expense: 0 }));
  const groups = new Map();
  for (const r of rows) {
    const amt = num(r.total);
    months[r.m - 1][r.type] += amt;
    if (r.type !== 'expense') continue;
    const rootId = r.parent_id ?? r.id;
    if (!groups.has(rootId)) {
      groups.set(rootId, {
        id: rootId,
        name: r.parent_id ? r.parent_name : r.name,
        color: r.parent_id ? r.parent_color : r.color,
        total: 0, months: Array(12).fill(0), kids: new Map(),
      });
    }
    const g = groups.get(rootId);
    g.total += amt;
    g.months[r.m - 1] += amt;
    const kidId = r.parent_id ? r.id : 'direct';
    const kidName = r.parent_id ? r.name : 'General';
    const kid = g.kids.get(kidId) ?? { id: r.id, name: kidName, total: 0 };
    kid.total += amt;
    g.kids.set(kidId, kid);
  }

  const income = months.reduce((a, m) => a + m.income, 0);
  const expense = months.reduce((a, m) => a + m.expense, 0);
  const active = months.filter((m) => m.income || m.expense);
  const categories = [...groups.values()]
    .map((g) => {
      const kids = [...g.kids.values()];
      const hasSubs = kids.some((k) => k.name !== 'General');
      return {
        id: g.id, name: g.name, color: g.color, total: g.total, months: g.months,
        share: expense > 0 ? g.total / expense : 0,
        children: hasSubs
          ? kids.sort((a, b) => b.total - a.total).map((k) => ({ ...k, share: g.total > 0 ? k.total / g.total : 0 }))
          : [],
      };
    })
    .sort((a, b) => b.total - a.total);

  res.json({
    year,
    years: yearRows.map((r) => r.y),
    income, expense, saved: income - expense,
    savingsRate: income > 0 ? (income - expense) / income : null,
    activeMonths: active.length,
    months,
    categories,
  });
});

/* ---------- savings goals ---------- */

const goalOut = (r) => ({ id: r.id, name: r.name, color: r.color, target: num(r.target), saved: num(r.saved) });

api.get('/goals', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, target, saved, color FROM goals ORDER BY id DESC');
  res.json(rows.map(goalOut));
});

api.post('/goals', async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 80);
  const target = Math.round(Number(req.body?.target) * 100) / 100;
  if (!name) throw httpError(400, 'Give your goal a name.');
  if (!(target > 0) || target >= 1e10) throw httpError(400, 'Enter a target amount greater than zero.');
  const colors = ['#2F52E0', '#0E9F73', '#E5484D', '#7A4DE8', '#F59E0B', '#0C8599'];
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM goals');
  const color = colors[n % colors.length];
  const [r] = await pool.query('INSERT INTO goals (name, target, color) VALUES (?,?,?)', [name, target, color]);
  res.status(201).json({ id: r.insertId, name, color, target, saved: 0 });
});

api.put('/goals/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const add = Math.round(Number(req.body?.add) * 100) / 100;
  if (!Number.isFinite(add) || add === 0 || Math.abs(add) >= 1e10) throw httpError(400, 'Enter an amount to add.');
  const [r] = await pool.query('UPDATE goals SET saved = GREATEST(saved + ?, 0) WHERE id = ?', [add, id]);
  if (r.affectedRows === 0) throw httpError(404, 'That goal no longer exists.');
  const [rows] = await pool.query('SELECT id, name, target, saved, color FROM goals WHERE id = ?', [id]);
  res.json(goalOut(rows[0]));
});

api.delete('/goals/:id', async (req, res) => {
  const [r] = await pool.query('DELETE FROM goals WHERE id = ?', [idParam(req.params.id)]);
  if (r.affectedRows === 0) throw httpError(404, 'That goal no longer exists.');
  res.status(204).end();
});

/* ---------- full backup (JSON) ---------- */

api.get('/backup.json', async (req, res) => {
  const dump = {};
  for (const table of ['categories', 'recurring', 'transactions', 'budgets', 'goals', 'settings']) {
    const [rows] = await pool.query(`SELECT * FROM ${table}`);
    dump[table] = rows;
  }
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="homebook-backup-${today()}.json"`,
    'Cache-Control': 'no-store',
  });
  res.send(JSON.stringify({ app: 'homebook', exported_at: new Date().toISOString(), ...dump }, null, 2));
});

/* ---------- delete a category or sub-category ---------- */

api.delete('/categories/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const [rows] = await pool.query('SELECT id, parent_id FROM categories WHERE id = ?', [id]);
  if (!rows.length) throw httpError(404, 'Category not found.');
  const cat = rows[0];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (cat.parent_id) {
      // Sub-category: its entries and repeats move up to the parent, so no totals are lost.
      await conn.query('UPDATE transactions SET category_id = ? WHERE category_id = ?', [cat.parent_id, id]);
      await conn.query('UPDATE recurring SET category_id = ? WHERE category_id = ?', [cat.parent_id, id]);
    } else {
      const [[{ kids }]] = await conn.query('SELECT COUNT(*) AS kids FROM categories WHERE parent_id = ?', [id]);
      const [[{ used }]] = await conn.query('SELECT COUNT(*) AS used FROM transactions WHERE category_id = ?', [id]);
      const [[{ rec }]] = await conn.query('SELECT COUNT(*) AS rec FROM recurring WHERE category_id = ?', [id]);
      if (kids) throw httpError(400, 'Delete its sub-categories first.');
      if (used || rec) throw httpError(400, 'This category has entries. Edit or delete them first.');
    }
    await conn.query('DELETE FROM categories WHERE id = ?', [id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

/* ---------- meta and settings ---------- */

api.get('/meta', async (req, res) => {
  const [categories] = await pool.query(
    'SELECT id, slug, name, type, color, parent_id FROM categories ORDER BY type, sort_order, name',
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
    `SELECT c.id, c.name, c.color, c.type, c.parent_id,
            p.name AS parent_name, p.color AS parent_color,
            SUM(t.amount) AS total, COUNT(*) AS entries
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
      WHERE t.tx_date >= ? AND t.tx_date < ?
      GROUP BY c.id ORDER BY total DESC`,
    [start, next],
  );

  const [dailyRows] = await pool.query(
    `SELECT DAY(tx_date) AS d, SUM(amount) AS total
       FROM transactions WHERE type = 'expense' AND tx_date >= ? AND tx_date < ?
      GROUP BY d ORDER BY d`,
    [start, next],
  );
  const [prevStart, prevNext] = monthRange(addMonths(month, -1));
  const [prevCatRows] = await pool.query(
    `SELECT c.id, c.name, c.color, c.type, c.parent_id,
            p.name AS parent_name, p.color AS parent_color,
            SUM(t.amount) AS total, COUNT(*) AS entries
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
      WHERE t.tx_date >= ? AND t.tx_date < ?
      GROUP BY c.id`,
    [prevStart, prevNext],
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
  // Roll sub-categories up into their parent and keep them as `children`.
  const shape = (rows, type, total) => {
    const groups = new Map();
    for (const r of rows.filter((x) => x.type === type)) {
      const rootId = r.parent_id ?? r.id;
      if (!groups.has(rootId)) {
        groups.set(rootId, {
          id: rootId,
          name: r.parent_id ? r.parent_name : r.name,
          color: r.parent_id ? r.parent_color : r.color,
          total: 0, entries: 0, direct: 0, children: [],
        });
      }
      const g = groups.get(rootId);
      const amt = num(r.total);
      g.total += amt;
      g.entries += num(r.entries);
      if (r.parent_id) g.children.push({ id: r.id, name: r.name, total: amt, entries: num(r.entries) });
      else g.direct += amt;
    }
    return [...groups.values()]
      .map((g) => {
        const kids = g.children;
        if (kids.length && g.direct > 0) kids.push({ id: g.id, name: 'General', total: g.direct, entries: 0 });
        kids.sort((a, b) => b.total - a.total);
        return {
          id: g.id, name: g.name, color: g.color, total: g.total, entries: g.entries,
          share: total > 0 ? g.total / total : 0,
          children: kids.map((k) => ({ ...k, share: g.total > 0 ? k.total / g.total : 0 })),
        };
      })
      .sort((a, b) => b.total - a.total);
  };

  const [any] = await pool.query('SELECT 1 FROM transactions LIMIT 1');

  res.json({
    month,
    income: current.income,
    expense: current.expense,
    balance: current.income - current.expense,
    savingsRate: current.income > 0 ? (current.income - current.expense) / current.income : null,
    previous: { month: previous.month, income: previous.income, expense: previous.expense },
    categories: shape(catRows, 'expense', current.expense),
    prevCategories: shape(prevCatRows, 'expense', previous.expense),
    daily: dailyRows.map((r) => ({ day: Number(r.d), total: num(r.total) })),
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
  if (isDate(req.query.from) || isDate(req.query.to)) {
    if (isDate(req.query.from)) { where.push('t.tx_date >= ?'); args.push(req.query.from); }
    if (isDate(req.query.to)) { where.push('t.tx_date <= ?'); args.push(req.query.to); }
  } else if (req.query.month) {
    const [start, next] = monthRange(monthParam(req.query.month));
    where.push('t.tx_date >= ? AND t.tx_date < ?');
    args.push(start, next);
  }
  const minAmt = Number(req.query.min);
  const maxAmt = Number(req.query.max);
  if (req.query.min !== undefined && req.query.min !== '' && Number.isFinite(minAmt)) { where.push('t.amount >= ?'); args.push(minAmt); }
  if (req.query.max !== undefined && req.query.max !== '' && Number.isFinite(maxAmt)) { where.push('t.amount <= ?'); args.push(maxAmt); }
  if (['income', 'expense'].includes(req.query.type)) {
    where.push('t.type = ?');
    args.push(req.query.type);
  }
  if (req.query.category) {
    // a parent category also matches the entries of its sub-categories
    const cid = idParam(req.query.category);
    where.push('(t.category_id = ? OR c.parent_id = ?)');
    args.push(cid, cid);
  }
  const q = String(req.query.q ?? '').trim().slice(0, 80);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push('(t.note LIKE ? OR c.name LIKE ?)');
    args.push(like, like);
  }
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 500, 1), 1000);

  const [rows] = await pool.query(
    `SELECT t.id, t.type, t.category_id, CONCAT_WS(' › ', p.name, c.name) AS category, c.color, t.amount,
            t.tx_date AS date, t.note, t.recurring_id
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
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
    `SELECT t.tx_date AS date, t.type, CONCAT_WS(' › ', p.name, c.name) AS category, t.amount, t.note
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
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
    `SELECT t.tx_date, t.type, CONCAT_WS(' › ', p.name, c.name) AS category, t.amount, t.note
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
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
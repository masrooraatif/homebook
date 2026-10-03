import { pool } from './db.js';
import { addMonths, currentMonth, daysInMonth, pad, today } from './util.js';

// Small seeded generator so the demo data looks the same every time.
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fills an empty book with six months of realistic household data. Returns rows added. */
export async function loadDemo() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [cats] = await conn.query('SELECT id, slug FROM categories');
    const id = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
    const rand = rng(42);
    const between = (a, b) => Math.round(a + rand() * (b - a));
    const now = currentMonth();
    const first = addMonths(now, -5);
    const limit = today();

    const recDefs = [
      ['income', 'salary', 85000, 1, 'Salary'],
      ['expense', 'rent', 22000, 3, 'House rent'],
      ['expense', 'internet', 999, 8, 'Broadband'],
    ];
    const rec = {};
    for (const [type, slug, amount, day, note] of recDefs) {
      const [r] = await conn.query(
        'INSERT INTO recurring (type, category_id, amount, day_of_month, note, start_month) VALUES (?,?,?,?,?,?)',
        [type, id[slug], amount, day, note, first],
      );
      rec[slug] = r.insertId;
    }

    const rows = [];
    const add = (month, day, type, slug, amount, note = '', recurringId = null) => {
      const date = `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
      if (date > limit) return;
      rows.push([type, id[slug], amount, date, note, recurringId]);
    };

    for (let i = 5; i >= 0; i--) {
      const m = addMonths(now, -i);
      add(m, 1, 'income', 'salary', 85000, 'Salary', rec.salary);
      if (rand() > 0.4) add(m, 18, 'income', 'business', between(6000, 18000), 'Freelance work');
      if (i % 3 === 0) add(m, 28, 'income', 'interest', between(900, 1600), 'Bank interest');

      add(m, 3, 'expense', 'rent', 22000, 'House rent', rec.rent);
      add(m, 8, 'expense', 'internet', 999, 'Broadband', rec.internet);
      add(m, 2, 'expense', 'help', 3500, 'Maid and cook');
      add(m, 10, 'expense', 'education', 4500, 'School fees');
      add(m, 12, 'expense', 'utilities', between(1800, 3400), 'Electricity and water');
      if (i % 3 === 0) add(m, 15, 'expense', 'insurance', 3200, 'Term insurance');

      for (let g = 0; g < 7; g++) {
        add(m, between(1, 28), 'expense', 'groceries', between(350, 2600), g % 2 ? 'Vegetables and fruit' : 'Supermarket');
      }
      for (let t = 0; t < 5; t++) {
        add(m, between(1, 28), 'expense', 'transport', between(150, 1400), t % 2 ? 'Auto and cab' : 'Petrol');
      }
      for (let d = 0; d < 4; d++) add(m, between(1, 28), 'expense', 'dining', between(300, 1800), 'Dinner out');
      if (rand() > 0.5) add(m, between(5, 25), 'expense', 'health', between(400, 3200), 'Pharmacy and clinic');
      add(m, between(5, 25), 'expense', 'entertainment', between(300, 1500), 'Movies');
      if (rand() > 0.4) add(m, between(5, 25), 'expense', 'shopping', between(800, 5000), 'Clothes');
      if (rand() > 0.6) add(m, between(5, 25), 'expense', 'maintenance', between(500, 3000), 'Plumber');
    }

    await conn.query(
      'INSERT INTO transactions (type, category_id, amount, tx_date, note, recurring_id) VALUES ?',
      [rows],
    );

    const budgets = [
      ['rent', 22000], ['groceries', 15000], ['utilities', 3500], ['dining', 4000],
      ['transport', 5000], ['entertainment', 3000], ['shopping', 5000],
    ].map(([slug, amount]) => [id[slug], amount]);
    await conn.query(
      'INSERT INTO budgets (category_id, amount) VALUES ? ON DUPLICATE KEY UPDATE amount = VALUES(amount)',
      [budgets],
    );

    await conn.commit();
    return rows.length;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

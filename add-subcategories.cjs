// One-time upgrade for an EXISTING database. Self-contained: needs only .env (DB_*), no other files.
// Adds categories.parent_id and the default sub-categories. Safe to run more than once.
// Run:  node add-subcategories.cjs
require('dotenv').config();
const mysql = require('mysql2/promise');

const SUBS = {
  groceries: ['Vegetables and fruit', 'Milk and dairy', 'Provisions', 'Meat and fish'],
  utilities: ['Electricity', 'Water', 'Gas cylinder'],
  internet: ['Broadband', 'Mobile recharge', 'DTH and TV'],
  transport: ['Petrol', 'Auto and cab', 'Bus and train', 'Vehicle service'],
  health: ['Doctor and clinic', 'Pharmacy', 'Tests and scans'],
  education: ['School fees', 'Tuition', 'Books and stationery'],
  dining: ['Restaurants', 'Takeout', 'Snacks and tea'],
  entertainment: ['Movies', 'OTT subscriptions', 'Outings'],
  shopping: ['Clothes', 'Electronics', 'Household items'],
  help: ['Maid', 'Cook', 'Driver'],
  maintenance: ['Plumber', 'Electrician', 'Repairs'],
  insurance: ['Life', 'Health insurance', 'Vehicle insurance'],
  emi: ['Home loan', 'Vehicle loan', 'Personal loan'],
};
const slugify = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

(async () => {
  let db;
  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false },
      connectTimeout: 20000,
    });

    const [cols] = await db.query('SHOW COLUMNS FROM categories');
    if (!cols.some((c) => c.Field === 'parent_id')) {
      await db.query('ALTER TABLE categories ADD COLUMN parent_id INT UNSIGNED NULL, ADD INDEX idx_cat_parent (parent_id)');
      console.log('parent_id column added');
    } else {
      console.log('parent_id column already exists');
    }

    const [parents] = await db.query(
      'SELECT id, slug, type, color, sort_order FROM categories WHERE parent_id IS NULL',
    );
    let added = 0;
    for (const p of parents) {
      for (const name of SUBS[p.slug] ?? []) {
        const [r] = await db.query(
          'INSERT IGNORE INTO categories (slug, name, type, color, sort_order, parent_id) VALUES (?,?,?,?,?,?)',
          [`${slugify(name)}_p${p.id}`, name, p.type, p.color, p.sort_order, p.id],
        );
        added += r.affectedRows;
      }
    }
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM categories WHERE parent_id IS NOT NULL');
    console.log(`Done. New sub-categories added: ${added}. Total sub-categories: ${n}`);
  } catch (e) {
    console.error('FAILED:', e.code, e.message);
    process.exitCode = 1;
  } finally {
    if (db) await db.end();
  }
})();
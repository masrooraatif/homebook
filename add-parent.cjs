require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  try {
    const db = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false },
      connectTimeout: 20000
    });
    const [cols] = await db.query('SHOW COLUMNS FROM categories');
    const names = cols.map(c => c.Field);
    if (!names.includes('parent_id')) {
      await db.query('ALTER TABLE categories ADD COLUMN parent_id INT NULL');
      console.log('parent_id added');
    } else {
      console.log('parent_id already exists');
    }
    console.log((await db.query('SHOW COLUMNS FROM categories'))[0].map(c => c.Field));
    await db.end();
  } catch (e) {
    console.error('FAILED:', e.code, e.message);
  }
})();
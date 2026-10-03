import { pool } from '../db.js';
import { loadDemo } from '../demo.js';

try {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM transactions');
  if (n > 0) {
    console.log('The database already has entries, so nothing was added.');
  } else {
    console.log(`Added ${await loadDemo()} sample entries.`);
  }
} finally {
  await pool.end();
}

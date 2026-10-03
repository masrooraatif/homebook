import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';

const name = process.env.DB_NAME ?? 'homebook';
if (!/^[\w$]+$/.test(name)) throw new Error('DB_NAME may only contain letters, numbers, _ and $.');

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  multipleStatements: true,
});

try {
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${name}\``);
  await conn.query(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  console.log(`Database "${name}" is ready.`);
} finally {
  await conn.end();
}

-- Homebook schema. Works on MySQL 8+ and MariaDB 10.5+.
-- Run through `npm run db:init`, or manually:  mysql -u root -p homebook < schema.sql

CREATE TABLE IF NOT EXISTS categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(40)  NOT NULL UNIQUE,
  name        VARCHAR(80)  NOT NULL,
  type        ENUM('income','expense') NOT NULL,
  color       CHAR(7)      NOT NULL,
  sort_order  SMALLINT     NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recurring (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type          ENUM('income','expense') NOT NULL,
  category_id   INT UNSIGNED NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  day_of_month  TINYINT UNSIGNED NOT NULL,
  note          VARCHAR(255) NOT NULL DEFAULT '',
  start_month   CHAR(7) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recurring_category FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transactions (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type          ENUM('income','expense') NOT NULL,
  category_id   INT UNSIGNED NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  tx_date       DATE NOT NULL,
  note          VARCHAR(255) NOT NULL DEFAULT '',
  recurring_id  INT UNSIGNED NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tx_date (tx_date),
  INDEX idx_tx_category_date (category_id, tx_date),
  INDEX idx_tx_recurring (recurring_id),
  CONSTRAINT fk_tx_category  FOREIGN KEY (category_id)  REFERENCES categories(id),
  CONSTRAINT fk_tx_recurring FOREIGN KEY (recurring_id) REFERENCES recurring(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS budgets (
  category_id  INT UNSIGNED PRIMARY KEY,
  amount       DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_budget_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS budget_alerts (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id   INT UNSIGNED NOT NULL,
  month         CHAR(7) NOT NULL,
  budget        DECIMAL(12,2) NOT NULL,
  spent         DECIMAL(12,2) NOT NULL,
  sent_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget_alert (category_id, month),
  CONSTRAINT fk_budget_alert_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  k  VARCHAR(40)  PRIMARY KEY,
  v  VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO settings (k, v) VALUES ('currency', 'INR');

INSERT IGNORE INTO categories (slug, name, type, color, sort_order) VALUES
  ('salary',        'Salary',                 'income',  '#0E8F6B', 1),
  ('business',      'Business or freelance',  'income',  '#12B886', 2),
  ('rental_income', 'Rental income',          'income',  '#20C997', 3),
  ('interest',      'Interest and dividends', 'income',  '#38D9A9', 4),
  ('other_income',  'Other income',           'income',  '#63E6BE', 5),

  ('rent',          'Rent',                    'expense', '#4C6EF5', 10),
  ('emi',           'Loans and EMI',           'expense', '#7950F2', 11),
  ('groceries',     'Groceries',               'expense', '#2F9E44', 12),
  ('utilities',     'Electricity, water, gas', 'expense', '#F59F00', 13),
  ('internet',      'Internet and phone',      'expense', '#15AABF', 14),
  ('maintenance',   'Repairs and maintenance', 'expense', '#94A3B8', 15),
  ('help',          'Household help',          'expense', '#E8590C', 16),
  ('transport',     'Transport and fuel',      'expense', '#0C8599', 17),
  ('health',        'Health',                  'expense', '#E03131', 18),
  ('education',     'Education',               'expense', '#9C36B5', 19),
  ('insurance',     'Insurance',               'expense', '#7A8CA8', 20),
  ('dining',        'Dining and takeout',      'expense', '#D6336C', 21),
  ('entertainment', 'Entertainment',           'expense', '#BE4BDB', 22),
  ('shopping',      'Shopping',                'expense', '#74B816', 23),
  ('other',         'Other',                   'expense', '#868E96', 30);

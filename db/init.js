'use strict';

/**
 * db/init.js — SQLite database initialization
 * Tables: users, api_keys, usage_logs, subscriptions, parse_history
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'invoiceai.db');

let db = null;

function getDb() {
  if (db) return db;

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ─── Users table ───────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT,
      company       TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  // ─── API Keys table ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      key           TEXT UNIQUE NOT NULL,
      label         TEXT DEFAULT 'Default',
      is_active     INTEGER DEFAULT 1,
      last_used_at  TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ─── Subscriptions table ───────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER UNIQUE NOT NULL,
      plan            TEXT NOT NULL DEFAULT 'free',
      status          TEXT NOT NULL DEFAULT 'active',
      razorpay_order_id   TEXT,
      razorpay_payment_id TEXT,
      current_period_start TEXT,
      current_period_end   TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ─── Usage Logs table ──────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      api_key_id    INTEGER,
      endpoint      TEXT NOT NULL,
      status_code   INTEGER,
      response_time_ms INTEGER,
      created_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ─── Parse History table ───────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS parse_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      api_key_id      INTEGER,
      input_text_hash TEXT,
      invoice_number  TEXT,
      vendor          TEXT,
      total_amount    REAL,
      currency        TEXT,
      confidence      INTEGER,
      raw_request     TEXT,
      raw_response    TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ─── Indexes ───────────────────────────────────────────────────
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON usage_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_parse_history_user ON parse_history(user_id);
  `);

  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };

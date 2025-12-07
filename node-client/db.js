const path = require('path');
const Database = require('better-sqlite3');

// Render uses /var/data for persistent storage
const dbPath =
    process.env.NODE_ENV === 'production'
        ? '/var/data/data.db'
        : path.join(__dirname, 'data.db');

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;

// db.js
// This file sets up a SQLite database using better-sqlite3
// and ensures the `users` table exists.

const Database = require('better-sqlite3');

// This will create/open data.db in the project root
const db = new Database('data.db');

// Create users table if it does not already exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;

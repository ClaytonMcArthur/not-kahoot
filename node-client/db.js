// node-client/db.js

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Default: put DB next to this file
let dbDir = __dirname;

// If /var/data exists (Render persistent disk), prefer that
if (fs.existsSync('/var/data')) {
  dbDir = '/var/data';
}

// Make sure directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'data.db');

const db = new Database(dbPath);

// Create users table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;

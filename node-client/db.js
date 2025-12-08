// node-client/db.js

/**
 * SQLite database initialization for the Node API.
 *
 * Goals:
 * - Use a persistent path when available (e.g., Render disk at /var/data)
 * - Fall back to a local, repo-adjacent database during development
 * - Ensure required tables exist on startup
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Default: store the DB file next to this module (works well for local dev)
let dbDir = __dirname;

// If /var/data exists (e.g., Render persistent disk), prefer that location
// so the DB survives restarts/redeploys.
if (fs.existsSync('/var/data')) {
  dbDir = '/var/data';
}

// Ensure the chosen directory exists before opening the database file.
// `recursive: true` creates intermediate directories if needed.
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Final database file path (e.g., "<dbDir>/data.db")
const dbPath = path.join(dbDir, 'data.db');

// Open (or create) the SQLite database.
// better-sqlite3 is synchronous by design, which simplifies server startup/usage.
const db = new Database(dbPath);

// Create required tables if they don't already exist.
// This is safe to run on every startup due to IF NOT EXISTS.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    wins INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Export the shared DB connection for use by the API layer.
module.exports = db;
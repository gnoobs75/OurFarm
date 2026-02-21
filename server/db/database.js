// server/db/database.js
// SQLite database connection and initialization.

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

export function getDB() {
  if (!db) {
    db = new Database(join(__dirname, '../../ourfarm.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Run schema
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schema);
  }
  return db;
}

export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

// server/db/database.js
// SQLite database connection and initialization.

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/Logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

export function getDB() {
  if (!db) {
    const dbPath = join(__dirname, '../../ourfarm.db');
    logger.info('DB', `Opening database at ${dbPath}`);
    try {
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');

      // Run schema
      const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
      db.exec(schema);

      // Migrations: add columns that may not exist in older databases
      try {
        db.exec('ALTER TABLE players ADD COLUMN professions TEXT DEFAULT \'{}\'');
      } catch (_) { /* column already exists */ }

      logger.info('DB', 'Schema initialized successfully');
    } catch (err) {
      logger.error('DB', 'Failed to initialize database', { error: err.message, stack: err.stack });
      throw err;
    }
  }
  return db;
}

export function closeDB() {
  if (db) {
    logger.info('DB', 'Closing database connection');
    db.close();
    db = null;
  }
}

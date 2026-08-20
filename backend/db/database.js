import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const DATABASE_PATH = path.join(currentDir, 'database.sqlite');

let database;

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      config TEXT,
      color TEXT,
      sku TEXT UNIQUE NOT NULL,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
  `);
}

function openDatabase() {
  fs.mkdirSync(currentDir, { recursive: true });
  database = new Database(DATABASE_PATH);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  createSchema(database);
  return database;
}

export function initializeDatabase() {
  return database?.open ? database : openDatabase();
}

export function getDatabase() {
  return database?.open ? database : openDatabase();
}

export async function createDatabaseBackup(targetPath) {
  await getDatabase().backup(targetPath);
}

function validateRestoreFile(filePath) {
  const candidate = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const integrity = candidate.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error('数据库完整性检查失败');

    const table = candidate.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'products'"
    ).get();
    if (!table) throw new Error('备份文件中缺少 products 表');

    const columns = candidate.prepare('PRAGMA table_info(products)').all().map((item) => item.name);
    const required = ['id', 'name', 'config', 'color', 'sku', 'remark'];
    if (!required.every((column) => columns.includes(column))) {
      throw new Error('products 表结构不兼容');
    }
  } finally {
    candidate.close();
  }
}

export function restoreDatabase(sourcePath) {
  validateRestoreFile(sourcePath);
  const rollbackPath = `${DATABASE_PATH}.rollback`;

  if (database?.open) {
    database.pragma('wal_checkpoint(TRUNCATE)');
    database.close();
  }
  database = undefined;

  try {
    if (fs.existsSync(DATABASE_PATH)) fs.copyFileSync(DATABASE_PATH, rollbackPath);
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${DATABASE_PATH}${suffix}`;
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    }
    fs.copyFileSync(sourcePath, DATABASE_PATH);
    openDatabase();
    if (fs.existsSync(rollbackPath)) fs.unlinkSync(rollbackPath);
  } catch (error) {
    if (database?.open) database.close();
    database = undefined;
    if (fs.existsSync(rollbackPath)) {
      fs.copyFileSync(rollbackPath, DATABASE_PATH);
      fs.unlinkSync(rollbackPath);
    }
    openDatabase();
    throw error;
  }
}

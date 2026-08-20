import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { getDatabase } from '../db/database.js';

const router = Router();
const uploadDir = path.resolve('uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(extension === '.xlsx' || extension === '.xls' ? null : new Error('仅支持 .xlsx 或 .xls 文件'), extension === '.xlsx' || extension === '.xls');
  }
});

const clean = (value) => {
  const result = value == null ? '' : String(value).trim();
  return result || null;
};

const requiredText = (value) => String(value ?? '').trim();

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

router.get('/export', (_req, res, next) => {
  try {
    const rows = getDatabase().prepare(
      'SELECT sku, name, config, color, remark FROM products ORDER BY id DESC'
    ).all();
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ['sku', 'name', 'config', 'color', 'remark']
    });
    worksheet['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 42 }, { wch: 18 }, { wch: 28 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '商品数据');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="products_${timestamp()}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

router.post('/import', upload.single('file'), (req, res, next) => {
  if (!req.file) return res.status(400).json({ code: 1, data: null, msg: '请选择 Excel 文件' });

  try {
    const workbook = XLSX.readFile(req.file.path);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error('Excel 文件中没有可读取的工作表');
    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
    const db = getDatabase();
    const findBySku = db.prepare('SELECT id FROM products WHERE sku = ?');
    const insert = db.prepare(
      'INSERT INTO products (sku, name, config, color, remark) VALUES (?, ?, ?, ?, ?)'
    );
    const update = db.prepare(`
      UPDATE products
      SET name = ?, config = ?, color = ?, remark = ?, updated_at = datetime('now')
      WHERE sku = ?
    `);
    const errors = [];
    let success = 0;

    const importRows = db.transaction((items) => {
      items.forEach((source, index) => {
        const normalized = Object.fromEntries(
          Object.entries(source).map(([key, value]) => [String(key).trim().toLowerCase(), value])
        );
        const sku = requiredText(normalized.sku);
        const name = requiredText(normalized.name);
        if (!sku || !name) {
          errors.push({ row: index + 2, reason: !sku ? 'SKU不能为空' : '商品名称不能为空' });
          return;
        }
        try {
          const values = [clean(normalized.config), clean(normalized.color), clean(normalized.remark)];
          if (findBySku.get(sku)) update.run(name, ...values, sku);
          else insert.run(sku, name, ...values);
          success += 1;
        } catch (error) {
          errors.push({ row: index + 2, reason: error.message });
        }
      });
    });
    importRows(rows);

    res.json({
      code: 0,
      data: { total: rows.length, success, failed: errors.length, errors },
      msg: '导入完成'
    });
  } catch (error) {
    next(error);
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }
});

router.post('/batch-delete', (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids)
      ? [...new Set(req.body.ids.map(Number).filter(Number.isInteger))]
      : [];
    if (!ids.length) return res.status(400).json({ code: 1, data: null, msg: '请选择要删除的商品' });
    const placeholders = ids.map(() => '?').join(',');
    const info = getDatabase().prepare(`DELETE FROM products WHERE id IN (${placeholders})`).run(...ids);
    res.json({ code: 0, data: { count: info.changes }, msg: '批量删除成功' });
  } catch (error) {
    next(error);
  }
});

router.get('/', (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    let sql = 'SELECT * FROM products';
    let params = [];
    if (q) {
      sql += " WHERE sku LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR config LIKE ? ESCAPE '\\'";
      const escaped = q.replace(/[\\%_]/g, '\\$&');
      const like = `%${escaped}%`;
      params = [like, like, like];
    }
    sql += ' ORDER BY id DESC';
    const rows = getDatabase().prepare(sql).all(...params);
    res.json({ code: 0, data: rows, msg: 'success' });
  } catch (error) {
    next(error);
  }
});

router.post('/', (req, res, next) => {
  const name = requiredText(req.body.name);
  const sku = requiredText(req.body.sku);
  if (!name || !sku) return res.status(400).json({ code: 1, data: null, msg: 'name和sku为必填字段' });

  try {
    const db = getDatabase();
    const info = db.prepare(
      'INSERT INTO products (name, sku, config, color, remark) VALUES (?, ?, ?, ?, ?)'
    ).run(name, sku, clean(req.body.config), clean(req.body.color), clean(req.body.remark));
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
    res.json({ code: 0, data: row, msg: '新增成功' });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ code: 1, data: null, msg: 'SKU已存在，请使用不同的SKU' });
    }
    next(error);
  }
});

router.put('/:id', (req, res, next) => {
  const id = Number(req.params.id);
  const name = requiredText(req.body.name);
  const sku = requiredText(req.body.sku);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ code: 1, data: null, msg: '商品ID无效' });
  if (!name || !sku) return res.status(400).json({ code: 1, data: null, msg: 'name和sku为必填字段' });

  try {
    const db = getDatabase();
    const info = db.prepare(`
      UPDATE products
      SET name = ?, sku = ?, config = ?, color = ?, remark = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, sku, clean(req.body.config), clean(req.body.color), clean(req.body.remark), id);
    if (!info.changes) return res.status(404).json({ code: 1, data: null, msg: '商品不存在' });
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.json({ code: 0, data: row, msg: '更新成功' });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ code: 1, data: null, msg: 'SKU已存在，请使用不同的SKU' });
    }
    next(error);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ code: 1, data: null, msg: '商品ID无效' });
    const info = getDatabase().prepare('DELETE FROM products WHERE id = ?').run(id);
    if (!info.changes) return res.status(404).json({ code: 1, data: null, msg: '商品不存在' });
    res.json({ code: 0, data: null, msg: '删除成功' });
  } catch (error) {
    next(error);
  }
});

export default router;

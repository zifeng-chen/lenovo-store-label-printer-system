import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { createDatabaseBackup, restoreDatabase } from '../db/database.js';

const router = Router();
const uploadDir = path.resolve('uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const valid = path.extname(file.originalname).toLowerCase() === '.db';
    callback(valid ? null : new Error('仅支持 .db 数据库文件'), valid);
  }
});

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

router.get('/backup', async (_req, res, next) => {
  const filename = `database_${timestamp()}.db`;
  const tempPath = path.join(uploadDir, filename);
  try {
    await createDatabaseBackup(tempPath);
    res.download(tempPath, filename, (error) => {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    next(error);
  }
});

router.post('/restore', upload.single('file'), (req, res, next) => {
  if (!req.file) return res.status(400).json({ code: 1, data: null, msg: '请选择 .db 备份文件' });
  try {
    restoreDatabase(req.file.path);
    res.json({ code: 0, data: null, msg: '恢复成功，请刷新页面' });
  } catch (error) {
    next(error);
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }
});

export default router;

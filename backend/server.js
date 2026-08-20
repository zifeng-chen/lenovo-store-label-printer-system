import express from 'express';
import cors from 'cors';
import productsRouter from './routes/products.js';
import backupRouter from './routes/backup.js';
import { initializeDatabase } from './db/database.js';

initializeDatabase();

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ code: 0, data: { status: 'ok' }, msg: 'success' });
});
app.use('/api/products', productsRouter);
app.use('/api', backupRouter);

app.use((_req, res) => {
  res.status(404).json({ code: 1, data: null, msg: '接口不存在' });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error instanceof multerErrorPlaceholder ? 400 : 500;
  res.status(status).json({ code: 1, data: null, msg: error.message || '服务器内部错误' });
});

// 避免直接依赖 multer 类型，同时将上传校验错误统一作为客户端错误返回。
function multerErrorPlaceholder() {}
Object.defineProperty(multerErrorPlaceholder, Symbol.hasInstance, {
  value: (instance) => instance?.name === 'MulterError' || /仅支持|文件过大/.test(instance?.message ?? '')
});

app.listen(port, () => {
  console.log(`LSLP backend running at http://localhost:${port}`);
});

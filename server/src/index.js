import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(projectRoot, '.env') });
import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { connectDB } from './config/db.js';
import api from './routes/api.js';
import { submitExpiredAttempts } from './services/attempts.js';
import { advanceAssessmentStates } from './services/assessment-schedule.js';
import { registerSocketHandlers } from './realtime/socket.js';
import { setIO } from './services/realtime.js';
const app = express();
const origin = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',');
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet());
app.use(cors({ origin, credentials: true, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(
  '/api',
  rateLimit({ windowMs: 15 * 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }),
);
app.use(
  '/api/auth',
  rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }),
);
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, data: { service: 'rvce-academic-hub-api', time: new Date().toISOString() } }),
);
app.use('/api', api);
app.use((err, _req, res, _next) => {
  if (err?.name === 'MulterError')
    return res.status(400).json({
      ok: false,
      error: err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the configured upload limit' : 'Invalid upload',
    });
  if (err?.name === 'ZodError')
    return res.status(400).json({
      ok: false,
      error: 'Validation failed',
      details: err.issues.map((x) => ({ path: x.path.join('.'), message: x.message })),
    });
  if (err?.code === 11000)
    return res.status(409).json({ ok: false, error: 'A record with this unique value already exists' });
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error:
      status === 500
        ? process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message
        : err.message,
  });
});
const server = http.createServer(app);
const io = new Server(server, { cors: { origin, credentials: true } });
app.set('io', io);
setIO(io);
registerSocketHandlers(io);
export { app, server, io };
if (process.env.NODE_ENV !== 'test')
  setInterval(() => {
    advanceAssessmentStates().catch((err) => console.error('Assessment schedule sweep failed:', err.message));
    submitExpiredAttempts().catch((err) => console.error('Attempt expiration sweep failed:', err.message));
  }, 5000).unref();
if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT) || 4000;
  connectDB()
    .then(() => server.listen(port, () => console.log(`RVCE Academic Hub API listening on ${port}`)))
    .catch((err) => {
      console.error('Database connection failed:', err.message);
      process.exit(1);
    });
}

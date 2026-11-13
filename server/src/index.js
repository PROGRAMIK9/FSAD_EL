import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(projectRoot, '.env') });
import http from 'node:http';
import { existsSync } from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import { connectDB } from './config/db.js';
import { apiLimiter, signInLimiter } from './middleware/rate-limits.js';
import api from './routes/api.js';
import { submitExpiredAttempts } from './services/attempts.js';
import { advanceAssessmentStates } from './services/assessment-schedule.js';
import { registerSocketHandlers } from './realtime/socket.js';
import { setIO } from './services/realtime.js';
const app = express();
const origin = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',');
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'wasm-unsafe-eval' lets the self-hosted OCR engine (tesseract.js, pdf.js) compile WebAssembly.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'https://accounts.google.com/gsi/client'],
        workerSrc: ["'self'"],
        frameSrc: ['https://accounts.google.com/gsi/'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'https://accounts.google.com/gsi/'],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://accounts.google.com/gsi/style',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // Google sign-in opens a popup that must be able to post back to this window.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(cors({ origin, credentials: true, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', apiLimiter);
app.post(['/api/auth/google', '/api/auth/dev-login'], signInLimiter);
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, data: { service: 'rvce-academic-hub-api', time: new Date().toISOString() } }),
);
app.use('/api', api);
app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

// In production the API also serves the built client (one origin: no CORS or cross-site cookies).
const clientDist = resolve(projectRoot, 'client/dist');
if (
  (process.env.NODE_ENV === 'production' || process.env.SERVE_CLIENT === 'true') &&
  process.env.SERVE_CLIENT !== 'false' &&
  existsSync(resolve(clientDist, 'index.html'))
) {
  app.use(
    '/assets',
    express.static(resolve(clientDist, 'assets'), { immutable: true, maxAge: '1y', index: false }),
  );
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(resolve(clientDist, 'index.html'));
  });
}
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

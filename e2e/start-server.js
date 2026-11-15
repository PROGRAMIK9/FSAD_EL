/**
 * Starts a throwaway copy of the app for end-to-end tests:
 * resets the e2e database, loads the real seed plus test accounts, builds the
 * client (unless E2E_SKIP_BUILD=true) and runs the API, which serves the client.
 * Refuses to touch anything but a local database whose name contains "e2e".
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/';
const dbName = process.env.MONGODB_DB || 'rvce_e2e';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(uri) || !dbName.includes('e2e')) {
  console.error(
    `Refusing to reset ${uri} / ${dbName}: e2e needs a local database whose name contains "e2e".`,
  );
  process.exit(1);
}
const env = {
  ...process.env,
  MONGODB_URI: uri,
  MONGODB_DB: dbName,
  NODE_ENV: 'e2e',
  E2E: 'true',
  DEV_LOGIN: 'true',
  SERVE_CLIENT: 'true',
  JWT_SECRET: process.env.JWT_SECRET || 'e2e-only-secret-not-for-production',
  ALLOWED_EMAIL_DOMAINS: 'rvce.edu.in',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || 'e2e-google-client-id',
  PORT: process.env.E2E_PORT || '4300',
  CLIENT_ORIGIN: `http://localhost:${process.env.E2E_PORT || '4300'}`,
};

await mongoose.connect(uri, { dbName });
await mongoose.connection.dropDatabase();
await mongoose.disconnect();
const run = (args, extra = {}) =>
  execFileSync(process.execPath, args, { cwd: root, env: { ...env, ...extra }, stdio: 'inherit' });
run(['server/src/scripts/seed.js']);
run(['server/src/scripts/e2e-fixtures.js']);
if (process.env.E2E_SKIP_BUILD !== 'true')
  execFileSync('npm', ['run', 'build', '-w', 'client'], {
    cwd: root,
    env: { ...env, VITE_API_URL: '/api', NODE_ENV: 'production' },
    stdio: 'inherit',
  });

// Importing the server connects to MongoDB and starts listening on PORT.
Object.assign(process.env, env);
await import('../server/src/index.js');

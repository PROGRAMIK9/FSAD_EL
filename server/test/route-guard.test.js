import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/index.js';
import api from '../src/routes/api.js';

/** Routes that must work without a session. Everything else under /api must answer 401. */
const PUBLIC = new Set([
  'POST /auth/google',
  'GET /auth/dev-login',
  'POST /auth/dev-login',
  'POST /auth/logout',
]);
const OBJECT_ID = '0123456789abcdef01234567';

function collectRoutes(stack, out = []) {
  for (const layer of stack) {
    if (layer.route)
      for (const method of Object.keys(layer.route.methods))
        for (const path of [].concat(layer.route.path)) out.push({ method: method.toUpperCase(), path });
    else if (layer.name === 'router' && layer.handle?.stack) collectRoutes(layer.handle.stack, out);
  }
  return out;
}

const concrete = (path) => path.replace(/\.:format\b/g, '.csv').replace(/:[A-Za-z]+/g, OBJECT_ID);

test('every API route outside the public allow-list requires a session', async () => {
  const routes = collectRoutes(api.stack);
  assert.ok(routes.length > 60, `expected the full route table, found ${routes.length}`);
  const unguarded = [];
  for (const { method, path } of routes) {
    if (PUBLIC.has(`${method} ${path}`)) continue;
    const res = await request(app)
      [method.toLowerCase()](`/api${concrete(path)}`)
      .send({});
    if (res.status !== 401) unguarded.push(`${method} ${path} -> ${res.status}`);
  }
  assert.deepEqual(unguarded, []);
});

test('the public allow-list only names routes that exist', () => {
  const names = new Set(collectRoutes(api.stack).map((r) => `${r.method} ${r.path}`));
  for (const name of PUBLIC) assert.ok(names.has(name), `${name} is not a registered route`);
});

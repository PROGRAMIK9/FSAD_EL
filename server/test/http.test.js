import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/index.js';
test('health endpoint returns the consistent API envelope', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.data.service, 'rvce-academic-hub-api');
});
test('admin dashboard rejects requests without a session', async () => {
  const response = await request(app).get('/api/admin/dashboard').expect(401);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /Authentication required/);
});

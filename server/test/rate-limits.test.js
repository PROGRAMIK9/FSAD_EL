import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ||= 'test-secret';
const { requestKey } = await import('../src/middleware/rate-limits.js');

const req = (cookie, ip = '10.0.0.1') => ({
  ip,
  cookies: cookie ? { accessToken: cookie } : {},
  get: () => undefined,
});

test('signed-in requests are limited per session, not per shared IP', () => {
  const a = jwt.sign({ sub: 'student-a' }, process.env.JWT_SECRET);
  const b = jwt.sign({ sub: 'student-b' }, process.env.JWT_SECRET);
  const ka = requestKey(req(a));
  assert.match(ka, /^s:/);
  assert.notEqual(ka, requestKey(req(b)), 'two students behind one NAT get separate budgets');
  assert.equal(ka, requestKey(req(a, '10.9.9.9')), 'the same session keeps its key across IPs');
});

test('anonymous and forged sessions fall back to the IP key', () => {
  assert.equal(requestKey(req(null)), 'ip:10.0.0.1');
  const forged = jwt.sign({ sub: 'x' }, 'not-the-secret');
  assert.equal(requestKey(req(forged)), 'ip:10.0.0.1');
  assert.equal(requestKey(req('garbage')), 'ip:10.0.0.1');
});

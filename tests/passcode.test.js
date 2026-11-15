import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPasscode, verifyPasscode, validatePasscode, registerFail, lockedFor } from '../app/passcode.js';

test('the right passcode verifies', async () => {
  const rec = await hashPasscode('seed2027');
  assert.equal(await verifyPasscode('seed2027', rec), true);
});

test('a wrong passcode is rejected', async () => {
  const rec = await hashPasscode('seed2027');
  assert.equal(await verifyPasscode('seed2028', rec), false);
  assert.equal(await verifyPasscode('', rec), false);
});

test('each hash gets its own random 16-byte salt', async () => {
  const a = await hashPasscode('same');
  const b = await hashPasscode('same');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.equal(Buffer.from(a.salt, 'base64').length, 16);
});

test('hashing uses at least 150,000 PBKDF2 iterations', async () => {
  const rec = await hashPasscode('seed2027');
  assert.ok(rec.iterations >= 150000);
  assert.equal(await verifyPasscode('seed2027', { ...rec, iterations: rec.iterations - 1 }), false);
});

test('the stored record never contains the passcode', async () => {
  const rec = await hashPasscode('mysecret99');
  assert.ok(!JSON.stringify(rec).includes('mysecret99'));
  assert.deepEqual(Object.keys(rec).sort(), ['hash', 'iterations', 'salt']);
});

test('passcode rules: 4+ English letters or digits', () => {
  assert.equal(validatePasscode('ab12'), '');
  assert.equal(validatePasscode('Seed2027'), '');
  assert.notEqual(validatePasscode('abc'), '');
  assert.notEqual(validatePasscode('ab c1'), '');
  assert.notEqual(validatePasscode('กขคง'), '');
});

test('5 wrong tries lock input for 30 seconds', () => {
  const now = 1_000_000;
  let s = { fails: 0, until: 0 };
  for (let i = 0; i < 4; i++) s = registerFail(s, now);
  assert.equal(lockedFor(s, now), 0);
  s = registerFail(s, now);
  assert.equal(lockedFor(s, now), 30);
  assert.equal(lockedFor(s, now + 29_500), 1);
  assert.equal(lockedFor(s, now + 30_000), 0);
});

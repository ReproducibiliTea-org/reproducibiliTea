'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { signToken, verifyToken } = require('./tokens');

const SECRET = 'test-secret-do-not-use-in-prod';

test('signToken then verifyToken round-trips the payload', () => {
  const token = signToken({ purpose: 'edit', email: 'a@b.com', jcid: 'oxford' }, SECRET);
  const result = verifyToken(token, SECRET);
  assert.equal(result.valid, true);
  assert.equal(result.payload.purpose, 'edit');
  assert.equal(result.payload.email, 'a@b.com');
  assert.equal(result.payload.jcid, 'oxford');
});

test('verifyToken rejects a tampered payload', () => {
  const token = signToken({ purpose: 'edit', jcid: 'oxford' }, SECRET);
  const [payloadPart, signaturePart] = token.split('.');
  const tampered = `${payloadPart}x.${signaturePart}`;
  const result = verifyToken(tampered, SECRET);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'bad_signature');
});

test('verifyToken rejects a token signed with a different secret', () => {
  const token = signToken({ purpose: 'edit', jcid: 'oxford' }, SECRET);
  const result = verifyToken(token, 'a-different-secret');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'bad_signature');
});

test('verifyToken rejects an expired token', () => {
  const token = signToken({ purpose: 'edit', jcid: 'oxford' }, SECRET, { expiresInMs: -1000 });
  const result = verifyToken(token, SECRET);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'expired');
});

test('verifyToken accepts a token that has not yet expired', () => {
  const token = signToken({ purpose: 'edit', jcid: 'oxford' }, SECRET, { expiresInMs: 60_000 });
  const result = verifyToken(token, SECRET);
  assert.equal(result.valid, true);
});

test('verifyToken rejects malformed input', () => {
  assert.equal(verifyToken('not-a-real-token', SECRET).reason, 'malformed');
  assert.equal(verifyToken('', SECRET).reason, 'malformed');
  assert.equal(verifyToken(null, SECRET).reason, 'malformed');
});

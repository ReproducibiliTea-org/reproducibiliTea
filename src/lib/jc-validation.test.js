'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanData, checkData } = require('./jc-validation');

function validData(overrides = {}) {
  return {
    jcid: 'academia',
    name: 'Academia',
    uni: 'University of Academia',
    email: 'lead@academia.ac',
    post: 'Room 1, Academia',
    country: 'United Kingdom',
    lead: 'Good Scholar',
    geolocation: [51.5, -0.1],
    ...overrides
  };
}

test('cleanData strips diacritics from jcid and lowercases it', () => {
  const cleaned = cleanData({ jcid: 'ÉCOLE-Normale' });
  assert.equal(cleaned.jcid, 'ecole-normale');
});

test('cleanData fills missing optional fields with empty strings', () => {
  const cleaned = cleanData({});
  assert.equal(cleaned.www, '');
  assert.equal(cleaned.description, '');
});

test('cleanData collects helperN fields into a helpers array', () => {
  const cleaned = cleanData({ helper0: 'A', helper1: 'B', helper2: '' });
  assert.deepEqual(cleaned.helpers, ['A', 'B']);
});

test('cleanData extracts an OSF id from a full URL', () => {
  const cleaned = cleanData({ osf: 'https://osf.io/3qrj6/' });
  assert.equal(cleaned.osf, '3qrj6');
});

test('checkData accepts fully valid data with no authCode field', () => {
  assert.equal(checkData(cleanData(validData())), null);
});

test('checkData rejects an invalid jcid', () => {
  const data = cleanData(validData({ jcid: 'bad id!' }));
  assert.match(checkData(data), /invalid characters/);
});

test('checkData rejects a malformed email', () => {
  const data = cleanData(validData({ email: 'not-an-email' }));
  assert.match(checkData(data), /invalid/);
});

test('checkData rejects malformed geolocation', () => {
  const data = cleanData(validData({ geolocation: [51.5] }));
  assert.match(checkData(data), /geolocation/);
});

test('checkData rejects an overlong description', () => {
  const data = cleanData(validData({ description: 'a'.repeat(1001) }));
  assert.match(checkData(data), /description is too long/);
});

test('checkData rejects an overlong address', () => {
  const data = cleanData(validData({ post: 'a'.repeat(501) }));
  assert.match(checkData(data), /address is too long/);
});

test('checkData does not require or check an authCode field', () => {
  const data = cleanData(validData());
  assert.ok(!('authCode' in data) || checkData(data) === null);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJournalClub } = require('./rollcall-lib');

const SAMPLE_JC = `---
jcid: oxford
title: Oxford
contact: lazaros.belbasis@ndph.ox.ac.uk
additional-contact: []
last-message-timestamp: 1704454960
last-message-level: 0
last-update-timestamp: 1704454960
---

Body text here.
`;

test('parseJournalClub extracts a real Date from numeric timestamps', () => {
  const jc = parseJournalClub(SAMPLE_JC);
  assert.equal(jc.jcid, 'oxford');
  assert.equal(jc.title, 'Oxford');
  assert.ok(!Number.isNaN(jc.lastUpdate.getTime()), 'lastUpdate must not be Invalid Date');
  assert.ok(!Number.isNaN(jc.lastMessage.getTime()), 'lastMessage must not be Invalid Date');
  assert.equal(jc.lastUpdate.getTime(), 1704454960 * 1000);
  assert.equal(jc.lastMessageLevel, 0);
  assert.deepEqual(jc.contactEmails, ['lazaros.belbasis@ndph.ox.ac.uk']);
});

test('parseJournalClub collects additional-contact emails', () => {
  const jc = parseJournalClub(SAMPLE_JC.replace('additional-contact: []', 'additional-contact:\n  - "a@b.com Name"\n  - "c@d.com"'));
  assert.deepEqual(jc.contactEmails, ['lazaros.belbasis@ndph.ox.ac.uk', 'a@b.com', 'c@d.com']);
});

test('parseJournalClub defaults missing timestamps to epoch, not Invalid Date', () => {
  const jc = parseJournalClub('---\njcid: x\ntitle: X\n---\nbody');
  assert.equal(jc.lastUpdate.getTime(), 0);
  assert.equal(jc.lastMessage.getTime(), 0);
  assert.equal(jc.lastMessageLevel, 0);
});

test('parseJournalClub throws on a file with no YAML header', () => {
  assert.throws(() => parseJournalClub('no header here'), /no YAML header found/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJournalClub, isViableForRollcall, pickJournalClub, newMessageLevel, MESSAGE_LEVELS } = require('./rollcall-lib');

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

function daysAgo(now, days) {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

test('isViableForRollcall is true only when both thresholds are exceeded', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const stale = { lastUpdate: daysAgo(now, 400), lastMessage: daysAgo(now, 400) };
  const recentlyMessaged = { lastUpdate: daysAgo(now, 400), lastMessage: daysAgo(now, 5) };
  const recentlyUpdated = { lastUpdate: daysAgo(now, 10), lastMessage: daysAgo(now, 400) };
  assert.equal(isViableForRollcall(stale, now), true);
  assert.equal(isViableForRollcall(recentlyMessaged, now), false);
  assert.equal(isViableForRollcall(recentlyUpdated, now), false);
});

test('pickJournalClub returns null when nothing is viable', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const jcs = [{ jcid: 'a', lastUpdate: now, lastMessage: now, modified: now }];
  assert.equal(pickJournalClub(jcs, now), null);
});

test('pickJournalClub picks the least-recently-modified viable JC', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const jcs = [
    { jcid: 'a', lastUpdate: daysAgo(now, 400), lastMessage: daysAgo(now, 400), modified: daysAgo(now, 40) },
    { jcid: 'b', lastUpdate: daysAgo(now, 400), lastMessage: daysAgo(now, 400), modified: daysAgo(now, 90) }
  ];
  assert.equal(pickJournalClub(jcs, now).jcid, 'b');
});

test('pickJournalClub honors an explicit target jcid, case-insensitively', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const jcs = [
    { jcid: 'a', lastUpdate: daysAgo(now, 400), lastMessage: daysAgo(now, 400), modified: daysAgo(now, 40) },
    { jcid: 'b', lastUpdate: daysAgo(now, 400), lastMessage: daysAgo(now, 400), modified: daysAgo(now, 90) }
  ];
  assert.equal(pickJournalClub(jcs, now, 'A').jcid, 'a');
});

test('newMessageLevel increments the last level', () => {
  assert.equal(newMessageLevel({ lastMessageLevel: MESSAGE_LEVELS.NOTIFICATION }), MESSAGE_LEVELS.FIRST_REMINDER);
});

const { substituteHandlebars } = require('./rollcall-lib');

test('substituteHandlebars replaces matching placeholders and leaves others untouched', () => {
  const result = substituteHandlebars(
    { subject: 'Update from {{ jcTitle }}', body: 'Dear {{ jcTitle }} team, {{ unknown }} stays.' },
    { jcTitle: 'Oxford' }
  );
  assert.equal(result.subject, 'Update from Oxford');
  assert.equal(result.body, 'Dear Oxford team, {{ unknown }} stays.');
});

test('substituteHandlebars passes non-string fields through unchanged', () => {
  const result = substituteHandlebars({ count: 3 }, { count: 'x' });
  assert.equal(result.count, 3);
});

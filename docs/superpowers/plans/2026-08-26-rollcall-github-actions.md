# Rollcall Fix + GitHub Actions Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the rollcall date-parsing bug, remove its dependency on MongoDB, and move it from an unscheduled Netlify function to a scheduled GitHub Actions workflow.

**Architecture:** Split the existing `src/jc-rollcall.js` into a pure, unit-testable logic module (`scripts/rollcall-lib.js`) and a thin I/O orchestration script (`scripts/rollcall.js`) that a GitHub Actions cron workflow invokes directly with `node`. The orchestration script uses Node's built-in `fetch` (no `node-fetch` dependency) and the built-in `GITHUB_TOKEN` GitHub Actions provides (no PAT). This also establishes the repo's Node test infrastructure (`.nvmrc`, `npm test`, a test CI workflow) used by later plans.

**Tech Stack:** Node.js (built-in `node:test`, `node:assert`, built-in `fetch`), `yaml` (already a dependency), `mailgun.js` (already a dependency), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-26-website-modernization-design.md`

## Global Constraints

- Node version: pin via `.nvmrc` to `20` (LTS; has built-in `fetch` and stable `node:test`).
- No new npm dependencies for testing — use Node's built-in `node:test` + `node:assert`.
- No manually-computed `Content-Length` headers on any HTTP request this plan writes — let `fetch` compute it, per the spec's UTF-8 correctness section (§6). This plan resolves 3 of the 6 flagged sites (`jc-rollcall.js:338,365,411`) by deleting them along with the old file.
- Every function/script logs one JSON line per significant event (start, action taken, error) to stdout/stderr — no logging framework.
- `_journal-clubs/*.md` frontmatter format is unchanged by this plan (no new fields).

---

## File Structure

- Create: `.nvmrc` — pins Node version for local dev, Netlify, and GitHub Actions.
- Create: `scripts/rollcall-lib.js` — pure logic: parsing a JC file's frontmatter, staleness checks, picking which JC to act on, handlebars substitution. No network calls, fully unit-testable.
- Create: `scripts/rollcall-lib.test.js` — unit tests for the above.
- Create: `scripts/rollcall.js` — orchestration: fetches JC data from GitHub, decides the action via `rollcall-lib.js`, sends the email via Mailgun, commits the result back to GitHub (or performs a dry-run log instead).
- Create: `scripts/rollcall.test.js` — tests the orchestration logic with `fetch` stubbed, no real network calls.
- Create: `.github/workflows/rollcall.yml` — daily scheduled workflow + manual `workflow_dispatch` with `jc` and `dry_run` inputs.
- Create: `.github/workflows/test.yml` — runs `npm test` on push/PR to `master`, mirroring the existing `jekyll.yml` pattern.
- Modify: `package.json` — add `"scripts": {"test": "node --test"}`.
- Delete: `src/jc-rollcall.js` — superseded by `scripts/rollcall-lib.js` + `scripts/rollcall.js`.
- Modify: `README.md` — remove the rollcall-specific MongoDB mention (edit-token MongoDB mention stays until the next plan removes it), document the new `.github/workflows/rollcall.yml` secrets.

---

### Task 1: Test infrastructure + `parseJournalClub` (fixes the date bug)

**Files:**
- Create: `.nvmrc`
- Modify: `package.json`
- Create: `scripts/rollcall-lib.js`
- Create: `scripts/rollcall-lib.test.js`

**Interfaces:**
- Produces: `parseJournalClub(content: string) -> { jcid: string|null, title: string|null, lastUpdate: Date, lastMessage: Date, lastMessageLevel: number, contactEmails: string[] }`. Throws `Error('Invalid journal club file - no YAML header found.')` if `content` has no `---`-delimited YAML header.

- [ ] **Step 1: Pin Node version and add the test script**

Create `.nvmrc`:
```
20
```

Edit `package.json` — add a `"scripts"` block (the file currently has none):
```json
{
  "name": "reproducibiliTea",
  "version": "1.0.2",
  "scripts": {
    "test": "node --test",
    "debug": "netlify dev --inspect",
    "serve": "netlify dev"
  },
  "dependencies": {
    "mongodb": "^6.8.0",
    "yaml": "^2.3.1"
  },
  "devDependencies": {
    "diacritic": "0.0.2",
    "dotenv": "^8.6.0",
    "mailgun.js": "^12.5.0",
    "netlify-cli": "^23.13.0",
    "node-fetch": "^2.6.7"
  }
}
```

- [ ] **Step 2: Run the test script to confirm it works with zero tests**

Run: `npm test`
Expected: `node --test` runs and reports `0 tests` with exit code 0 (no test files exist yet).

- [ ] **Step 3: Write the failing test for `parseJournalClub`**

Create `scripts/rollcall-lib.test.js`:
```js
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './rollcall-lib'`

- [ ] **Step 5: Implement `rollcall-lib.js` with `parseJournalClub`**

Create `scripts/rollcall-lib.js`:
```js
'use strict';

const YAML = require('yaml');

const MESSAGE_LEVELS = {
  UP_TO_DATE: 0,
  NOTIFICATION: 1,
  FIRST_REMINDER: 2,
  SECOND_REMINDER: 3,
  JC_DEACTIVATED: 4
};

const ACTIONS = {
  1: 'Send notification.',
  2: 'First reminder.',
  3: 'Second reminder.',
  4: 'Deactivate journal club.'
};

const MAX_DAYS_SINCE_UPDATE = 365;
const MIN_DAYS_BETWEEN_EMAILS = 28;

/**
 * Parse a journal club markdown file's YAML frontmatter into a plain object.
 * @param {string} content - full file content, including the --- delimiters
 */
function parseJournalClub(content) {
  const match = /^---(.*?)---\s*([\s\S]*)$/s.exec(content);
  if (!match) {
    throw new Error('Invalid journal club file - no YAML header found.');
  }
  const yaml = YAML.parse(match[1]) || {};

  const contactEmails = [];
  if (yaml.contact) contactEmails.push(yaml.contact);
  if (Array.isArray(yaml['additional-contact'])) {
    contactEmails.push(...yaml['additional-contact']);
  }

  return {
    jcid: yaml.jcid || null,
    title: yaml.title || null,
    lastUpdate: typeof yaml['last-update-timestamp'] === 'number'
      ? new Date(yaml['last-update-timestamp'] * 1000)
      : new Date(0),
    lastMessage: typeof yaml['last-message-timestamp'] === 'number'
      ? new Date(yaml['last-message-timestamp'] * 1000)
      : new Date(0),
    lastMessageLevel: typeof yaml['last-message-level'] === 'number'
      ? yaml['last-message-level']
      : MESSAGE_LEVELS.UP_TO_DATE,
    contactEmails: contactEmails
      .map(e => (typeof e === 'string' ? e.trim().split(/\s+/)[0] : null))
      .filter(Boolean)
  };
}

module.exports = {
  MESSAGE_LEVELS,
  ACTIONS,
  MAX_DAYS_SINCE_UPDATE,
  MIN_DAYS_BETWEEN_EMAILS,
  parseJournalClub
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 4 tests passing.

- [ ] **Step 7: Commit**

```bash
git add .nvmrc package.json scripts/rollcall-lib.js scripts/rollcall-lib.test.js
git commit -m "Add Node test infra and fixed JC frontmatter parsing"
```

---

### Task 2: Staleness check + pick-next-JC logic

**Files:**
- Modify: `scripts/rollcall-lib.js`
- Modify: `scripts/rollcall-lib.test.js`

**Interfaces:**
- Consumes: `parseJournalClub` output shape from Task 1 (`{ jcid, title, lastUpdate, lastMessage, lastMessageLevel, contactEmails }`), plus a `modified: Date` property the caller attaches separately (GitHub's file `Last-Modified` header — not part of frontmatter, so not part of `parseJournalClub`).
- Produces: `isViableForRollcall(jc, now = new Date()) -> boolean`, `pickJournalClub(jcs: Array<jc & {modified: Date}>, now = new Date(), targetJcid = null) -> (jc|null)`, `newMessageLevel(jc) -> number`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/rollcall-lib.test.js` (add this import alongside the existing one):
```js
const { isViableForRollcall, pickJournalClub, newMessageLevel, MESSAGE_LEVELS } = require('./rollcall-lib');
```

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `isViableForRollcall is not a function` (or similar, undefined export).

- [ ] **Step 3: Implement the three functions**

Append to `scripts/rollcall-lib.js` (before the `module.exports` block):
```js
function daysAgo(now, days) {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

function isViableForRollcall(jc, now = new Date()) {
  const tooOld = daysAgo(now, MAX_DAYS_SINCE_UPDATE);
  const tooRecent = daysAgo(now, MIN_DAYS_BETWEEN_EMAILS);
  return jc.lastUpdate < tooOld && jc.lastMessage < tooRecent;
}

function pickJournalClub(jcs, now = new Date(), targetJcid = null) {
  const viable = jcs.filter(jc => isViableForRollcall(jc, now));
  if (!viable.length) return null;
  if (targetJcid) {
    const lower = targetJcid.toLowerCase();
    return viable.find(jc => jc.jcid && jc.jcid.toLowerCase() === lower) || null;
  }
  return viable.reduce((oldest, jc) =>
    jc.modified.getTime() < oldest.modified.getTime() ? jc : oldest
  );
}

function newMessageLevel(jc) {
  return jc.lastMessageLevel + 1;
}
```

Update the `module.exports` block to include the new functions:
```js
module.exports = {
  MESSAGE_LEVELS,
  ACTIONS,
  MAX_DAYS_SINCE_UPDATE,
  MIN_DAYS_BETWEEN_EMAILS,
  parseJournalClub,
  isViableForRollcall,
  pickJournalClub,
  newMessageLevel
};
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `npm test`
Expected: PASS — 9 tests passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/rollcall-lib.js scripts/rollcall-lib.test.js
git commit -m "Add rollcall staleness check and JC-picking logic"
```

---

### Task 3: Handlebars substitution

**Files:**
- Modify: `scripts/rollcall-lib.js`
- Modify: `scripts/rollcall-lib.test.js`

**Interfaces:**
- Produces: `substituteHandlebars(template: Record<string,string>, subs: Record<string,string>) -> Record<string,string>` — returns a new object; non-string fields pass through unchanged; unmatched `{{ x }}` placeholders are left as-is.

- [ ] **Step 1: Write the failing test**

Append to `scripts/rollcall-lib.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `substituteHandlebars is not a function`.

- [ ] **Step 3: Implement it**

Append to `scripts/rollcall-lib.js` (before `module.exports`):
```js
function substituteHandlebars(template, subs) {
  const out = {};
  for (const key of Object.keys(template)) {
    if (typeof template[key] !== 'string') {
      out[key] = template[key];
      continue;
    }
    let value = template[key];
    for (const subKey of Object.keys(subs)) {
      value = value.replace(new RegExp(`{{ *${subKey} *}}`, 'g'), subs[subKey]);
    }
    out[key] = value;
  }
  return out;
}
```

Add `substituteHandlebars` to `module.exports`.

- [ ] **Step 4: Run to verify all tests pass**

Run: `npm test`
Expected: PASS — 11 tests passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/rollcall-lib.js scripts/rollcall-lib.test.js
git commit -m "Add handlebars substitution for rollcall email templates"
```

---

### Task 4: Orchestration script (`scripts/rollcall.js`)

**Files:**
- Create: `scripts/rollcall.js`
- Create: `scripts/rollcall.test.js`

**Interfaces:**
- Consumes: `MESSAGE_LEVELS`, `ACTIONS`, `parseJournalClub`, `isViableForRollcall` (indirectly via `pickJournalClub`), `pickJournalClub`, `newMessageLevel`, `substituteHandlebars` from `./rollcall-lib` (Tasks 1-3).
- Produces: `async function run({ repoApi, token, targetJcid, dryRun, mailgunConfig }) -> Promise<void>`, exported for testing. The `require.main === module` block wires this to `process.env` and calls `process.exit(1)` on fatal error.

- [ ] **Step 1: Write the failing test**

Create `scripts/rollcall.test.js`:
```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('./rollcall');

function jsonResponse(body, headers = {}) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    headers: { get: (name) => headers[name.toLowerCase()] || null }
  };
}

function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
}

const JC_MD = `---
jcid: testjc
title: Test JC
contact: organiser@example.com
last-message-timestamp: 0
last-message-level: 0
last-update-timestamp: 0
---
body
`;

test('run() logs a dry-run action without sending email or committing', async (t) => {
  const calls = [];
  const originalFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });

    if (String(url).endsWith('/contents/_journal-clubs')) {
      return jsonResponse([{ name: 'testjc.md', path: '_journal-clubs/testjc.md', url: 'https://api.github.com/x/testjc.md' }]);
    }
    if (String(url) === 'https://api.github.com/x/testjc.md') {
      return jsonResponse(
        { name: 'testjc.md', path: '_journal-clubs/testjc.md', sha: 'abc', content: b64(JC_MD), url: 'https://api.github.com/x/testjc.md' },
        { 'last-modified': 'Wed, 01 Jan 2020 00:00:00 GMT' }
      );
    }
    if (String(url).includes('/contents/_emails/rollcall-message-1.json')) {
      return jsonResponse({ content: b64(JSON.stringify({ subject: 'Hi {{ jcTitle }}', body: 'Body {{ jcTitle }}' })) });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  t.after(() => { global.fetch = originalFetch; });

  await run({
    repoApi: 'https://api.github.com/x',
    token: 'fake-token',
    targetJcid: 'testjc',
    dryRun: true,
    mailgunConfig: { apiKey: 'x', domain: 'x', fromEmail: 'from@example.com' }
  });

  const methods = calls.map(c => c.method);
  assert.ok(!methods.includes('PUT'), 'dry run must not PUT any commit');
  assert.ok(!methods.includes('DELETE'), 'dry run must not DELETE any file');
});

test('run() does nothing when no journal club is viable', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith('/contents/_journal-clubs')) {
      return jsonResponse([{ name: 'testjc.md', path: '_journal-clubs/testjc.md', url: 'https://api.github.com/x/testjc.md' }]);
    }
    if (String(url) === 'https://api.github.com/x/testjc.md') {
      const freshJc = JC_MD.replace('last-update-timestamp: 0', `last-update-timestamp: ${Math.floor(Date.now() / 1000)}`);
      return jsonResponse(
        { name: 'testjc.md', path: '_journal-clubs/testjc.md', sha: 'abc', content: b64(freshJc), url: 'https://api.github.com/x/testjc.md' },
        { 'last-modified': new Date().toUTCString() }
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  t.after(() => { global.fetch = originalFetch; });

  // Should complete without throwing and without requesting an email template.
  await run({
    repoApi: 'https://api.github.com/x',
    token: 'fake-token',
    targetJcid: null,
    dryRun: true,
    mailgunConfig: { apiKey: 'x', domain: 'x', fromEmail: 'from@example.com' }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module './rollcall'`.

- [ ] **Step 3: Implement `scripts/rollcall.js`**

Create `scripts/rollcall.js`:
```js
'use strict';

const {
  MESSAGE_LEVELS,
  ACTIONS,
  parseJournalClub,
  pickJournalClub,
  newMessageLevel,
  substituteHandlebars
} = require('./rollcall-lib');

const USER_AGENT = 'reproducibiliTea-rollcall';

function log(event, fields = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}

async function githubRequest(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      Authorization: `token ${token}`,
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    throw new Error(`GitHub request failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res;
}

async function fetchJournalClubs(repoApi, token) {
  const listRes = await githubRequest(`${repoApi}/contents/_journal-clubs`, token);
  const list = await listRes.json();

  const jcs = [];
  for (const entry of list) {
    const fileRes = await githubRequest(entry.url, token);
    const modified = new Date(fileRes.headers.get('last-modified'));
    const file = await fileRes.json();
    const content = Buffer.from(file.content, 'base64').toString('utf8');
    try {
      const jc = parseJournalClub(content);
      jc.modified = modified;
      jc.githubFile = file;
      jc.rawContent = content;
      jcs.push(jc);
    } catch (e) {
      log('parse_error', { path: entry.path, error: e.message });
    }
  }
  return jcs;
}

async function sendRollcallEmail(jc, level, repoApi, token, mailgunConfig, dryRun) {
  const templateRes = await githubRequest(`${repoApi}/contents/_emails/rollcall-message-${level}.json`, token);
  const templateFile = await templateRes.json();
  const template = JSON.parse(Buffer.from(templateFile.content, 'base64').toString('utf8'));
  const email = substituteHandlebars(template, { jcTitle: jc.title });

  const recipients = [...jc.contactEmails];
  if (level === MESSAGE_LEVELS.JC_DEACTIVATED) {
    recipients.push(mailgunConfig.fromEmail);
  }

  if (dryRun) {
    log('dry_run_email', { jcid: jc.jcid, level, recipients });
    return;
  }

  const Mailgun = require('mailgun.js');
  const mailgun = new Mailgun(FormData);
  const mg = mailgun.client({ username: 'api', key: mailgunConfig.apiKey, url: 'https://api.eu.mailgun.net' });

  const to = recipients.shift();
  const data = {
    from: mailgunConfig.fromEmail,
    to,
    'h:Reply-To': mailgunConfig.fromEmail,
    subject: email.subject,
    html: email.body
  };
  if (recipients.length) data.cc = recipients.join(', ');

  await mg.messages.create(mailgunConfig.domain, data);
}

async function updateMessageStatus(jc, level, token, dryRun) {
  const newBody = jc.rawContent
    .replace(/last-message-timestamp: .+$/m, `last-message-timestamp: ${Math.floor(Date.now() / 1000)}`)
    .replace(/last-message-level: .+$/m, `last-message-level: ${level}`);

  if (dryRun) {
    log('dry_run_update', { jcid: jc.jcid, level });
    return;
  }

  await githubRequest(jc.githubFile.url, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Rollcall: Update ${jc.jcid}.md last message time.`,
      content: Buffer.from(newBody, 'utf8').toString('base64'),
      sha: jc.githubFile.sha
    })
  });
}

async function deactivateJC(jc, repoApi, token, dryRun) {
  const newPath = jc.githubFile.path.replace(/^_/, '_inactive-');

  if (dryRun) {
    log('dry_run_deactivate', { jcid: jc.jcid, newPath });
    return;
  }

  await githubRequest(`${repoApi}/contents/${newPath}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Rollcall: Archiving of ${jc.jcid}`,
      content: jc.githubFile.content
    })
  });

  await githubRequest(jc.githubFile.url, token, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Rollcall: Removing ${jc.githubFile.path}`,
      sha: jc.githubFile.sha
    })
  });
}

async function run({ repoApi, token, targetJcid, dryRun, mailgunConfig }) {
  log('rollcall_start', { targetJcid, dryRun });

  const jcs = await fetchJournalClubs(repoApi, token);
  const jc = pickJournalClub(jcs, new Date(), targetJcid);

  if (!jc) {
    log('rollcall_done', { result: 'no_viable_jc' });
    return;
  }

  const level = newMessageLevel(jc);
  log('rollcall_action', { jcid: jc.jcid, level, action: ACTIONS[level] });

  try {
    await sendRollcallEmail(jc, level, repoApi, token, mailgunConfig, dryRun);
  } catch (e) {
    log('rollcall_email_failed', { jcid: jc.jcid, error: e.message });
    return;
  }

  if (level >= MESSAGE_LEVELS.JC_DEACTIVATED) {
    await deactivateJC(jc, repoApi, token, dryRun);
  } else {
    await updateMessageStatus(jc, level, token, dryRun);
  }

  log('rollcall_done', { jcid: jc.jcid, action: ACTIONS[level] });
}

if (require.main === module) {
  const repoApi = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}`;
  const token = process.env.GITHUB_TOKEN;
  const targetJcid = process.env.ROLLCALL_JC || null;
  const dryRun = process.env.ROLLCALL_DRY_RUN === 'true';
  const mailgunConfig = {
    apiKey: process.env.MAILGUN_API_KEY,
    domain: process.env.MAILGUN_DOMAIN,
    fromEmail: process.env.FROM_EMAIL_ADDRESS
  };

  run({ repoApi, token, targetJcid, dryRun, mailgunConfig }).catch(e => {
    log('rollcall_fatal', { error: e.message });
    process.exit(1);
  });
}

module.exports = { run };
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `npm test`
Expected: PASS — 13 tests passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/rollcall.js scripts/rollcall.test.js
git commit -m "Add rollcall orchestration script using native fetch"
```

---

### Task 5: Wire up GitHub Actions, remove the old Netlify function

**Files:**
- Create: `.github/workflows/rollcall.yml`
- Create: `.github/workflows/test.yml`
- Delete: `src/jc-rollcall.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: `scripts/rollcall.js`'s `require.main === module` CLI entrypoint (Task 4) — reads `GITHUB_TOKEN`, `ROLLCALL_JC`, `ROLLCALL_DRY_RUN`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `FROM_EMAIL_ADDRESS` from `process.env`.

- [ ] **Step 1: Delete the superseded Netlify function and the dead migration script**

`src/add-jcid.js` is a one-off migration script (already run historically to backfill `jcid` fields) with no remaining callers or scheduled trigger — dead code, per the spec's out-of-scope cleanup list.

```bash
git rm src/jc-rollcall.js src/add-jcid.js
```

- [ ] **Step 2: Create the test CI workflow**

Create `.github/workflows/test.yml`:
```yaml
name: Unit tests

on:
  push:
    branches: [ master ]
  pull_request:
    branches: [ master ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
      - run: npm ci
      - run: npm test
```

- [ ] **Step 3: Create the rollcall scheduled workflow**

Create `.github/workflows/rollcall.yml`:
```yaml
name: Journal club rollcall

on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
    inputs:
      jc:
        description: 'jcid to target (optional; defaults to the oldest-updated viable JC)'
        required: false
      dry_run:
        description: 'Dry run: log the action but send no email and commit nothing'
        required: false
        default: true
        type: boolean

permissions:
  contents: write

jobs:
  rollcall:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
      - run: npm ci
      - run: node scripts/rollcall.js
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ROLLCALL_JC: ${{ github.event.inputs.jc }}
          ROLLCALL_DRY_RUN: ${{ github.event_name == 'workflow_dispatch' && github.event.inputs.dry_run || 'false' }}
          MAILGUN_API_KEY: ${{ secrets.MAILGUN_API_KEY }}
          MAILGUN_DOMAIN: ${{ secrets.MAILGUN_DOMAIN }}
          FROM_EMAIL_ADDRESS: ${{ secrets.FROM_EMAIL_ADDRESS }}
```

- [ ] **Step 4: Update README**

In `README.md`, replace the "Runtime configuration" section:

Old:
```markdown
## Runtime configuration

The Netlify functions under `src/` now use MongoDB for storing and validating edit tokens. Configure the following environment variables for deployments:

- `MONGODB_URI`: connection string for the MongoDB instance.
- `MONGODB_DB`: database name that contains the `editTokens` collection.

The previous FaunaDB secret (`FAUNA_KEY`) is no longer used and can be removed.
```

New:
```markdown
## Runtime configuration

### Netlify functions (`src/`)

The Netlify functions under `src/` still use MongoDB for storing and validating edit tokens (this is being removed in a follow-up change). Configure:

- `MONGODB_URI`: connection string for the MongoDB instance.
- `MONGODB_DB`: database name that contains the `editTokens` collection.

The previous FaunaDB secret (`FAUNA_KEY`) is no longer used and can be removed.

### Rollcall (GitHub Actions)

`.github/workflows/rollcall.yml` runs daily and can also be triggered manually (with a `dry_run` option) from the Actions tab. It needs these repository secrets:

- `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `FROM_EMAIL_ADDRESS` — same Mailgun account used by the Netlify functions.

It uses the built-in `GITHUB_TOKEN` (no personal access token needed) with `permissions: contents: write` to read and update journal club files.
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/rollcall.yml .github/workflows/test.yml README.md
git commit -m "Move rollcall to a scheduled GitHub Actions workflow"
```

- [ ] **Step 6: Manually verify on GitHub after merge**

Not a local step — after this is merged, trigger `.github/workflows/rollcall.yml` manually via `workflow_dispatch` with `dry_run: true` and no `jc` input, and confirm the Actions log shows a `rollcall_action` or `rollcall_done` JSON line with no errors.

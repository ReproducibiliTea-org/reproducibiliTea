# Signed Edit Tokens (Drop MongoDB) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MongoDB-backed edit tokens with stateless, self-contained, HMAC-signed tokens, and remove the MongoDB dependency from the codebase entirely.

**Architecture:** A single shared module, `src/lib/tokens.js`, signs and verifies tokens using Node's built-in `crypto` (HMAC-SHA256). It's generic over token "purpose" — this plan uses it for `edit` tokens; the creation-flow plan reuses it unchanged for `creation-confirm` and `admin-approve` tokens. `src/edit-jc_create-token.js` and `src/edit-jc_check-token.js` are rewritten to use it instead of MongoDB.

**Tech Stack:** Node.js built-in `crypto` (no new dependency), `node:test` for unit tests (established in the rollcall plan).

**Spec:** `docs/superpowers/specs/2026-08-26-website-modernization-design.md`

**Depends on:** `docs/superpowers/plans/2026-08-26-rollcall-github-actions.md` having been merged first (it adds `.nvmrc`, `npm test`, and `.github/workflows/test.yml` — this plan's tests rely on that infrastructure existing rather than recreating it). If that plan hasn't shipped yet, do Task 0 below instead of skipping straight to Task 1.

## Global Constraints

- No new npm dependencies. Token signing uses Node's built-in `crypto` module only.
- Tokens are stateless: no database read on verification, cannot be revoked early, only by expiry.
- Every function logs one JSON line per significant event (created, rejected + reason) — no logging framework.
- `EDIT_TOKEN_SECRET` is a new required Netlify environment variable; document it in `README.md`.

---

## File Structure

- Create: `src/lib/tokens.js` — `signToken`, `verifyToken`. Shared by this plan and the creation-flow plan.
- Create: `src/lib/tokens.test.js`
- Modify: `src/edit-jc_create-token.js` — drop MongoDB, sign a token, keep the existing "does this JC exist on GitHub" check and Mailgun email.
- Modify: `src/edit-jc_check-token.js` — drop MongoDB, verify the signed token.
- Modify: `package.json` — remove the `mongodb` dependency.
- Modify: `README.md` — replace the MongoDB env var docs with `EDIT_TOKEN_SECRET`.

---

### Task 0 (only if the rollcall plan hasn't shipped yet): minimal test infra

Skip this task entirely if `.nvmrc`, `package.json`'s `"test"` script, and `.github/workflows/test.yml` already exist (check with `test -f .nvmrc && grep -q '"test"' package.json`).

- [ ] Create `.nvmrc` containing `20`.
- [ ] Add `"scripts": {"test": "node --test"}` to `package.json`.
- [ ] Run `npm test` — expect `0 tests`, exit code 0.
- [ ] Commit: `git add .nvmrc package.json && git commit -m "Add Node test infra"`.

---

### Task 1: `src/lib/tokens.js` — sign and verify

**Files:**
- Create: `src/lib/tokens.js`
- Create: `src/lib/tokens.test.js`

**Interfaces:**
- Produces: `signToken(payload: object, secret: string, opts?: { expiresInMs?: number }) -> string`. `verifyToken(token: string, secret: string) -> { valid: true, payload: object } | { valid: false, reason: 'malformed'|'bad_signature'|'malformed_payload'|'expired' }`.
- The `payload` object is caller-defined — this module does not interpret any field except the `expires` field it adds itself when `expiresInMs` is given.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tokens.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module './tokens'`.

- [ ] **Step 3: Implement `src/lib/tokens.js`**

Create `src/lib/tokens.js`:
```js
'use strict';

const crypto = require('crypto');

function sign(payloadPart, secret) {
  return crypto.createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

/**
 * @param {object} payload - caller-defined fields to embed in the token
 * @param {string} secret
 * @param {{ expiresInMs?: number }} [opts]
 * @return {string} `${base64url(payload)}.${base64url(signature)}`
 */
function signToken(payload, secret, opts = {}) {
  const body = { ...payload };
  if (typeof opts.expiresInMs === 'number') {
    body.expires = Date.now() + opts.expiresInMs;
  }
  const payloadPart = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  return `${payloadPart}.${sign(payloadPart, secret)}`;
}

/**
 * @param {string} token
 * @param {string} secret
 * @return {{valid: true, payload: object} | {valid: false, reason: string}}
 */
function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'malformed' };
  }
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) {
    return { valid: false, reason: 'malformed' };
  }

  const expectedSignature = sign(payloadPart, secret);
  const provided = Buffer.from(signaturePart);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { valid: false, reason: 'bad_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch (e) {
    return { valid: false, reason: 'malformed_payload' };
  }

  if (typeof payload.expires === 'number' && Date.now() > payload.expires) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, payload };
}

module.exports = { signToken, verifyToken };
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `npm test`
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tokens.js src/lib/tokens.test.js
git commit -m "Add stateless HMAC-signed token module"
```

---

### Task 2: Rewrite `edit-jc_create-token.js`

**Files:**
- Modify: `src/edit-jc_create-token.js` (full rewrite)

**Interfaces:**
- Consumes: `signToken` from `./lib/tokens` (Task 1).
- Produces: Netlify function `exports.handler(event) -> Promise<{statusCode, body}>`. Request body: `{ email: string, jcid: string, message?: string }`. Response: `200` on success (email sent, or token silently created with no email when `email === 'rollcall'` or in sandbox mode — matching prior behavior), `400` on missing fields, `404` if the JC doesn't exist, `500` on unexpected error.

This is a full-file rewrite; there is no unit test for this task since it depends entirely on the GitHub and Mailgun network calls (already true of the current file) — Task 1's unit tests cover the part that's actually testable (the token itself). Verify this task by manual/integration testing against the sandbox GitHub repo after deploying, per Task 4's instructions.

- [ ] **Step 1: Replace the file contents**

Replace all of `src/edit-jc_create-token.js` with:
```js
// node fetch support
const fetch = require("node-fetch");
require('dotenv').config();
const { signToken } = require('./lib/tokens');

const {
    EDIT_TOKEN_SECRET,
    GITHUB_API_USER,
    MAILGUN_API_KEY,
    MAILGUN_DOMAIN,
    FROM_EMAIL_ADDRESS
} = process.env;

let { GITHUB_REPO_API } = process.env;

const TOKEN_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

exports.handler = async function(event) {
    console.log(JSON.stringify({ event: 'create_token_request_received' }));

    let sandbox = false;
    try {
        sandbox = /(sandbox|localhost)/.test(event.headers.referer);
        if (sandbox) {
            const { GITHUB_REPO_API_SANDBOX } = process.env;
            GITHUB_REPO_API = GITHUB_REPO_API_SANDBOX;
        }

        const data = JSON.parse(event.body);
        if (data.email) data.email = data.email.replace(/\s/sg, '');
        if (!data.email || !data.jcid) {
            return { statusCode: 400, body: 'Email and JCID must be submitted in JSON format in the request body.' };
        }

        const ghResponse = await fetch(`${GITHUB_REPO_API}/contents/_journal-clubs`, {
            headers: { 'User-Agent': GITHUB_API_USER }
        });
        const jcList = await ghResponse.json();
        const jcNames = jcList.map(jc => jc.name);
        if (!jcNames.includes(`${data.jcid}.md`)) {
            console.log(JSON.stringify({ event: 'create_token_unknown_jc', jcid: data.jcid }));
            return { statusCode: 404, body: `Requested journal club ${data.jcid} does not exist.` };
        }

        const token = signToken(
            { purpose: 'edit', email: data.email, jcid: data.jcid, message: data.message || '' },
            EDIT_TOKEN_SECRET,
            { expiresInMs: TOKEN_TTL_MS }
        );

        if (data.email !== 'rollcall' && !sandbox) {
            await sendEmail(data.email, data.jcid, token);
        }

        console.log(JSON.stringify({ event: 'create_token_success', jcid: data.jcid }));
        return { statusCode: 200, body: 'Token created successfully.' };
    } catch (e) {
        console.log(JSON.stringify({ event: 'create_token_failed', error: e.message }));
        return { statusCode: 500, body: e.message };
    }
};

/**
 * Handle the Mailgun API call
 * @param email {string} email to send to
 * @param jcid {string} journal club to edit
 * @param token {string} token to inject into the link
 */
async function sendEmail(email, jcid, token) {
    const Mailgun = require('mailgun.js');
    const mailgun = new Mailgun(FormData);
    const mg = mailgun.client({
        username: 'api', key: MAILGUN_API_KEY, url: 'https://api.eu.mailgun.net'
    });

    const mailgunData = {
        from: FROM_EMAIL_ADDRESS,
        to: email,
        'h:Reply-To': FROM_EMAIL_ADDRESS,
        subject: `Edit ReproducibiliTea ${jcid}.md link`,
        html: `
<p>Dear ReproducibiliTea Journal Club organiser,</p>
<p>An access token has been requested for your email address so that you can make edits to the journal club entry for ${jcid}.md on reproducibiliTea.org.</p>
<p>To make the edits, please follow the link below, which will take you to the page where you can edit the journal club details.</p>
<p><a href="https://reproducibiliTea.org/join-reproducibiliTea/?jcEditToken=${token}">https://reproducibiliTea.org/join-reproducibiliTea/?jcEditToken=${token}</a></p>
<p>This link will expire in 48h.</p>
<p>Thanks,</p>
<p>The ReproducibiliTea Web Team</p>
        `
    };

    await mg.messages.create(MAILGUN_DOMAIN, mailgunData);
}
```

Note: the `?jcEditToken=` query parameter and its consumer in `join-reproducibiliTea.html`'s `checkToken()` function expect `window.jcEditToken = {token: match[1]}` and then POST `JSON.stringify(window.jcEditToken)` to `edit-jc_check-token` — i.e. `{"token": "<the signed token>"}`. That contract is unchanged by this rewrite.

- [ ] **Step 2: Commit**

```bash
git add src/edit-jc_create-token.js
git commit -m "Replace MongoDB edit tokens with signed tokens (create side)"
```

---

### Task 3: Rewrite `edit-jc_check-token.js`

**Files:**
- Modify: `src/edit-jc_check-token.js` (full rewrite)

**Interfaces:**
- Consumes: `verifyToken` from `./lib/tokens` (Task 1).
- Produces: Netlify function `exports.handler(event) -> Promise<{statusCode, body}>`. Request body: `{ token: string }`. Response: `200` with `JSON.stringify(payload)` (containing `jcid`, `email`, `message`) on success — same field names the caller in `new-jc.js` already expects (`editToken.jcid`) — `400` on missing/malformed body, `401` on an invalid/expired/tampered token.

- [ ] **Step 1: Replace the file contents**

Replace all of `src/edit-jc_check-token.js` with:
```js
require('dotenv').config();
const { verifyToken } = require('./lib/tokens');

const { EDIT_TOKEN_SECRET } = process.env;

exports.handler = async function(event) {
    let data;
    try {
        data = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: 'Request body must be valid JSON.' };
    }

    if (!data.token) {
        return { statusCode: 400, body: 'Authorisation token must be specified in JSON format in the request body.' };
    }

    const result = verifyToken(data.token, EDIT_TOKEN_SECRET);
    if (!result.valid) {
        console.log(JSON.stringify({ event: 'check_token_rejected', reason: result.reason }));
        return { statusCode: 401, body: `Token invalid: ${result.reason}` };
    }

    console.log(JSON.stringify({ event: 'check_token_accepted', jcid: result.payload.jcid }));
    return { statusCode: 200, body: JSON.stringify(result.payload) };
};
```

- [ ] **Step 2: Commit**

```bash
git add src/edit-jc_check-token.js
git commit -m "Replace MongoDB edit tokens with signed tokens (check side)"
```

---

### Task 4: Remove MongoDB dependency and update docs

**Files:**
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:** none (cleanup task).

- [ ] **Step 1: Confirm nothing else imports `mongodb`**

Run: `grep -rn "require('mongodb')\|require(\"mongodb\")" src/ scripts/`
Expected: no output (both prior consumers were rewritten in Task 2/3 of this plan and in the rollcall plan).

- [ ] **Step 2: Remove the dependency**

Edit `package.json`, remove the `"mongodb": "^6.8.0",` line from `"dependencies"`.

- [ ] **Step 3: Reinstall to update the lockfile**

Run: `npm install`
Expected: `package-lock.json` updates to drop `mongodb` and its transitive dependencies; no errors.

- [ ] **Step 4: Update README**

Replace the "Runtime configuration" → "Netlify functions" section in `README.md` (written by the rollcall plan) with:
```markdown
### Netlify functions (`src/`)

Edit tokens are stateless, HMAC-signed strings — no database. Configure:

- `EDIT_TOKEN_SECRET`: secret key used to sign and verify edit tokens. Rotating it invalidates all outstanding tokens.
```

If the rollcall plan hasn't shipped yet and that section doesn't exist, instead replace the original:
```markdown
## Runtime configuration

The Netlify functions under `src/` now use MongoDB for storing and validating edit tokens. Configure the following environment variables for deployments:

- `MONGODB_URI`: connection string for the MongoDB instance.
- `MONGODB_DB`: database name that contains the `editTokens` collection.

The previous FaunaDB secret (`FAUNA_KEY`) is no longer used and can be removed.
```
with:
```markdown
## Runtime configuration

Edit tokens are stateless, HMAC-signed strings — no database. Configure:

- `EDIT_TOKEN_SECRET`: secret key used to sign and verify edit tokens. Rotating it invalidates all outstanding tokens.
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests from this plan and any prior plans still pass (removing `mongodb` doesn't touch their code paths).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json README.md
git commit -m "Remove MongoDB dependency now that all consumers use signed tokens"
```

- [ ] **Step 7: Deployment note (not a code step)**

After deploying, remove the now-unused `MONGODB_URI` and `MONGODB_DB` environment variables from the Netlify site settings, and add `EDIT_TOKEN_SECRET` (a long random string, e.g. `openssl rand -base64 48`).

# Journal Club Creation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared `AUTH_CODE` creation gate with an email-confirm + admin-approval flow, remove the OSF-project-creation call ahead of OSF's November 2026 Projects deprecation, and fix the UTF-8 `Content-Length` bug in the functions this touches.

**Architecture:** Pure validation logic (`src/lib/jc-validation.js`) and the external-API calls (`src/lib/jc-integrations.js`) are extracted from the existing monolithic `src/new-jc.js` into shared, unit-testable modules — minus `callOSF`, which is deleted outright. `src/new-jc.js` keeps handling JC edits (its existing job) plus a new "request creation" step; two new Netlify functions, `src/new-jc_confirm.js` and `src/new-jc_approve.js`, handle the two email-link clicks. All three reuse `src/lib/tokens.js` (from the signed-edit-tokens plan) with different `purpose` values.

New JCs are committed to `_pending-journal-clubs/<jcid>.md` — a plain directory outside Jekyll's `journal-clubs` collection, following the same convention as the existing `_inactive-journal-clubs/` archive — so they're invisible to the public site without any Liquid filtering. Clicking the admin's emailed link opens a review page (`new-jc_approve.js`, GET) where the admin picks approve/reject/ignore and optionally writes a message (POST). Approve moves the file into `_journal-clubs/` (it goes live) and emails the requester's contact + additional-contact addresses; reject deletes the pending file and emails just the requester; ignore moves the file to `_pending-journal-clubs/ignored/<jcid>.md` (tagging it `ignored: true`) and emails only the central `EMAIL_REPORT_TO` account, with no requester-facing email. Approve/reject also bcc `EMAIL_REPORT_TO`. No `status:` frontmatter field is used anywhere — directory location is the state.

**Tech Stack:** Node.js, `node-fetch` (already a dependency), `mailgun.js` (already a dependency), `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-26-website-modernization-design.md`

**Depends on:** `docs/superpowers/plans/2026-08-26-signed-edit-tokens.md` must be merged first — this plan imports `src/lib/tokens.js` (`signToken`, `verifyToken`) unchanged from it.

## Global Constraints

- No manually-computed `Content-Length` headers on any HTTP request this plan writes — let the HTTP client compute it. This resolves the remaining 3 of the 6 sites flagged in the spec's UTF-8 correctness section (§6): `new-jc.js:508,580,765` (now inside `src/lib/jc-integrations.js`).
- No automation touches the `osf:` frontmatter field — it stays available for organisers to fill in manually.
- No new frontmatter field, and no migration of the ~180 existing JC files: pending/ignored state is directory location (`_pending-journal-clubs/`, `_pending-journal-clubs/ignored/`), not a field. `ignored: true` is added only to files moved into the ignored subdirectory.
- Every function logs one JSON line per significant event.
- Tokens signed here reuse `src/lib/tokens.js` from the signed-edit-tokens plan; do not duplicate signing logic.

---

## File Structure

- Create: `src/lib/jc-validation.js` — `cleanData(data)`, `checkData(data)` (no `authCode` field/check).
- Create: `src/lib/jc-validation.test.js`
- Create: `src/lib/jc-integrations.js` — `callSlack`, `callZotero`, `callGitHub` (accepts a `dir` option, target directory for the commit), `notifyAdmins` (takes `adminEmails` + a review link), `formatResponses`. No `callOSF`.
- Create: `src/lib/mailer.js` — tiny shared Mailgun-send helper (`to`/`cc`/`bcc`).
- Modify: `src/new-jc.js` — edit branch verifies tokens in-process (no more self-HTTP-call to `edit-jc_check-token`); create branch now signs+emails a `creation-confirm` token instead of creating anything immediately.
- Create: `src/new-jc_confirm.js` — verifies `creation-confirm` token, runs the integrations, commits the JC to `_pending-journal-clubs/` (not `_journal-clubs/`), emails admins an `admin-approve` token.
- Create: `src/new-jc_approve.js` — GET verifies `admin-approve` token and renders an approve/reject/ignore review page; POST performs the chosen action (move/delete the file on GitHub, email the relevant parties). No public pages need filtering — pending/ignored JCs are simply never in the `journal-clubs` collection.
- Modify: `join-reproducibiliTea.html` — remove the `AuthCodeRow` and `osfUserRow` fields (nothing consumes `osfUser` once `callOSF` is gone); update the step-1 welcome copy.
- Modify: `assets/js/join-form.js` — remove the dead `osfUser`-obsolete-marking block that would otherwise throw once `#osfUser` no longer exists.
- Modify: `README.md` — document `ADMIN_EMAILS`, `EMAIL_REPORT_TO`, and the `_pending-journal-clubs/` convention; remove `AUTH_CODE` from the env var list.

---

### Task 1: `src/lib/jc-validation.js`

**Files:**
- Create: `src/lib/jc-validation.js`
- Create: `src/lib/jc-validation.test.js`

**Interfaces:**
- Produces: `cleanData(data: object) -> object` (mutates and returns a cleaned copy — same behavior as the original `cleanData` in `new-jc.js`, minus nothing). `checkData(data: object) -> string | null` — returns the first validation error message, or `null` if valid. No `authCode` field is required or checked (that gate is replaced by token verification upstream).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/jc-validation.test.js`:
```js
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

test('checkData does not require or check an authCode field', () => {
  const data = cleanData(validData());
  assert.ok(!('authCode' in data) || checkData(data) === null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module './jc-validation'`.

- [ ] **Step 3: Implement `src/lib/jc-validation.js`**

Create `src/lib/jc-validation.js`, adapted from the original `cleanData`/`checkData` in `new-jc.js` (removing the `authCode` field and its check entirely):
```js
'use strict';

const Diacritics = require('diacritic');

const OPTIONAL_FIELDS = [
    'www', 'twitter', 'description', 'zoteroUser',
    'signup', 'uniWWW', 'osf'
];

const REQUIRED_FIELDS = [
    'jcid', 'name', 'uni', 'email', 'post',
    'country', 'lead', 'geolocation'
];

/**
 * Clean the incoming data
 * @param data {object} POST data in request
 * @return {object} cleaned POST data
 */
function cleanData(data) {
    for (const s of OPTIONAL_FIELDS) {
        if (!data.hasOwnProperty(s)) data[s] = "";
    }

    if (data.post) {
        data.post = data.post.replace(/,\s*/g, '\n');
        data.post = data.post.replace(/[\n\r]\r?/g, ', ');
        data.post = data.post.replace(/ {2,}/sg, ' ');
    }

    if (data.jcid) {
        data.jcid = Diacritics.clean(data.jcid.toLowerCase());
    }

    for (const x in data) {
        if (typeof data[x] !== "string") continue;
        data[x] = data[x].trim();
    }

    if (data.osf && data.osf.length) {
        const match = /^(?:https?:\/\/osf.io\/)?([0-9a-z]+)\/?$/i.exec(data.osf);
        if (match) data.osf = match[1];
    }

    data.helpers = [];
    for (let i = 0; data.hasOwnProperty('helper' + i.toString()); i++) {
        if (data['helper' + i.toString()].length) data.helpers.push(data['helper' + i.toString()]);
    }

    data.emails = [];
    for (let i = 0; data.hasOwnProperty('extraEmail' + i.toString()); i++) {
        if (data['extraEmail' + i.toString()].length) data.emails.push(data['extraEmail' + i.toString()]);
    }

    if (data.twitter) {
        while (data.twitter[0] === "@") data.twitter = data.twitter.substr(1);
    }

    if (data.geolocation) {
        const d = Array.isArray(data.geolocation) ? data.geolocation : data.geolocation.split(',');
        data.geolocation = d.map(a => parseFloat(a));
    }

    return data;
}

/**
 * Check the request for hygiene, completeness, and sanity
 * @param data {object} cleaned POST data
 * @return {string|null} the first validation error, or null if the data is valid
 */
function checkData(data) {
    for (const x of REQUIRED_FIELDS) {
        if (!data.hasOwnProperty(x)) return `The request is missing mandatory field '${x}'.`;
    }

    if (!/^[a-z0-9\-]+$/i.test(data.jcid)) {
        return `The id field ("${data.jcid}") contains invalid characters.`;
    }
    if (!/^[a-z0-9]*$/i.test(data.osf || '')) {
        return `The OSF repository ("${data.osf}") contains invalid characters.`;
    }
    if (!/^[0-9]*$/i.test(data.zoteroUser || '')) {
        return `The Zotero username ("${data.zoteroUser}") contains invalid characters.`;
    }
    if (!/\S+@\S+/i.test(data.email)) {
        return `The email address supplied("${data.email}") appears invalid.`;
    }
    for (const e of data.emails || []) {
        if (!/\S+@\S+/i.test(e)) return `The email address supplied("${e}") appears invalid.`;
    }
    if (!data.geolocation || data.geolocation.length !== 2 || !data.geolocation.every(isFinite)) {
        return "The geolocation data is not in the correct format.";
    }

    return null;
}

module.exports = { cleanData, checkData };
```

Note: `osfUser` is intentionally dropped from `OPTIONAL_FIELDS` — it existed only to add a contributor to the auto-created OSF project, which no longer exists.

- [ ] **Step 4: Run to verify all tests pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jc-validation.js src/lib/jc-validation.test.js
git commit -m "Extract JC data validation into a testable module, drop authCode/osfUser"
```

---

### Task 2: `src/lib/mailer.js`

**Files:**
- Create: `src/lib/mailer.js`

**Interfaces:**
- Produces: `async sendEmail({ apiKey, domain, from, to, cc, bcc, replyTo, subject, html }) -> Promise<void>`.

No unit test for this task — it's a thin wrapper around the `mailgun.js` client with no branching logic to assert on; it's exercised indirectly by manual testing in Task 6.

- [ ] **Step 1: Implement it**

Create `src/lib/mailer.js`:
```js
'use strict';

/**
 * Send an email via Mailgun.
 * @param {{apiKey: string, domain: string, from: string, to: string, cc?: string, replyTo?: string, subject: string, html: string}} opts
 */
async function sendEmail(opts) {
    const Mailgun = require('mailgun.js');
    const mailgun = new Mailgun(FormData);
    const mg = mailgun.client({ username: 'api', key: opts.apiKey, url: 'https://api.eu.mailgun.net' });

    const data = {
        from: opts.from,
        to: opts.to,
        'h:Reply-To': opts.replyTo || opts.from,
        subject: opts.subject,
        html: opts.html
    };
    if (opts.cc) data.cc = opts.cc;
    if (opts.bcc) data.bcc = opts.bcc;

    await mg.messages.create(opts.domain, data);
}

module.exports = { sendEmail };
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/mailer.js
git commit -m "Add shared Mailgun send helper"
```

---

### Task 3: `src/lib/jc-integrations.js` (Slack/Zotero/GitHub/admin-notify, no OSF, no manual Content-Length)

**Files:**
- Create: `src/lib/jc-integrations.js`

**Interfaces:**
- Consumes: `sendEmail` from `./mailer` (Task 2).
- Produces: `callSlack(data) -> report`, `callZotero(data) -> report`, `callGitHub(data, results, opts?: {editToken?, dir?}) -> report`, `notifyAdmins({data, results, approveToken, adminEmails, mailgunConfig}) -> report`, `formatResponses(results) -> string`. `report` shape: `{ title: string, status: 'Okay'|'Warning'|'Error', details: string[] }` (matching the original). `opts.dir` defaults to `'_journal-clubs'`; Task 5 passes `'_pending-journal-clubs'` for new creation requests. No `status` option — pending state is the directory, not a frontmatter field.

No unit test for this task — every exported function makes a real network call (GitHub/Zotero/Mailgun) with no pure branching logic worth asserting on in isolation; verify via Task 6's manual test against the sandbox GitHub repo.

- [ ] **Step 1: Implement it**

Create `src/lib/jc-integrations.js`, adapted from the original `new-jc.js` (`callSlack`, `callZotero`, `callGitHub`, `callMailgun` renamed to `notifyAdmins`), with `callOSF` deleted and the 3 manually-set `Content-Length` headers removed (letting `node-fetch` compute them correctly):
```js
'use strict';

const fetch = require('node-fetch');
const YAML = require('yaml');
const { sendEmail } = require('./mailer');

/**
 * Format a set of responses from API calls
 * @param re {object} dictionary of response objects
 * @return {string} HTML response body
 */
function formatResponses(re) {
    let out = "";
    for (const s in re) {
        if (!re.hasOwnProperty(s)) continue;
        const r = re[s];
        out += `
<div class="${r.status.toLowerCase()}">
<h2>${r.title} - <span class="${r.status.toLowerCase()}">${r.status}</span></h2>
`;
        out += '<ul>';
        for (const task of r.details) {
            out += `
    <li>${task}</li>`;
        }
        out += '</ul></div>';
    }
    return out;
}

async function callSlack(data) {
    return {
        title: 'Slack',
        status: 'Okay',
        details: [
            `Please join the workspace using the direct link: <a href="${process.env.SLACK_LINK}" target="_blank">${process.env.SLACK_LINK}</a>.
Please share this link with any organisers and members of your journal club who might like to join our discussions, attend networking events, or get notified about related initiatives.`
        ]
    };
}

async function callZotero(data) {
    const { ZOTERO_TOKEN } = process.env;
    const out = { title: 'Zotero', status: 'Okay', details: [], zoteroCollectionId: null };
    const url = 'https://api.zotero.org/groups/2354006';

    try {
        const call = await fetch(`${url}/collections`, { headers: { 'Zotero-API-Version': '3' } });
        if (!call.ok) throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        const response = await call.json();
        if (response.length) {
            for (const r of response) {
                if (r.data.name === data.name) {
                    out.status = 'Warning';
                    out.details.push('A Zotero collection with a similar name already exists; another will not be created.');
                    return out;
                }
            }
        }
    } catch (e) {
        out.status = 'Error';
        out.details.push('An error occurred: ' + e.toString());
        return out;
    }

    const addCollection = JSON.stringify([{ name: data.name, parentCollection: false }]);
    try {
        const call = await fetch(`${url}/collections`, {
            method: 'POST',
            headers: {
                'Zotero-API-Version': '3',
                Authorization: `Bearer ${ZOTERO_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: addCollection
        });
        if (!call.ok) throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        const response = await call.json();
        if (response.success && response.success[0] && response.success[0].length) {
            out.zoteroCollectionId = response.success[0];
            out.details.push(`Created new Zotero collection at <a href="https://www.zotero.org/groups/2354006/reproducibilitea/items/collectionKey/${out.zoteroCollectionId}" target="_blank">https://www.zotero.org/groups/2354006/reproducibilitea/items/collectionKey/${out.zoteroCollectionId}</a>.`);
        } else {
            out.status = 'Error';
            out.details.push('Unable to create Zotero collection.');
            return out;
        }
    } catch (e) {
        out.status = 'Error';
        out.details.push('An error occurred while creating the collection: ' + e.toString());
        return out;
    }

    if (!data.zoteroUser || !data.zoteroUser.length) return out;

    let members = [];
    try {
        const call = await fetch(url, { headers: { 'Zotero-API-Version': '3' } });
        if (!call.ok) throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        const response = await call.json();
        if (!response.data || !response.data.members) {
            out.status = 'Warning';
            out.details.push('Unable to add user as a Zotero group member.');
            return out;
        }
        members = [...response.data.members, data.zoteroUser];
    } catch (e) {
        out.status = 'Error';
        out.details.push('An error occurred while adding the user to the group: ' + e.toString());
        return out;
    }

    try {
        const call = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Zotero-API-Version': '3',
                Authorization: `Bearer ${ZOTERO_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([{ members }])
        });
        if (!call.ok) throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        await call.json();
        out.details.push('Added the user to the Zotero group.');
    } catch (e) {
        out.status = 'Warning';
        out.details.push('An error occurred while adding the user as a group member: ' + e.toString());
        return out;
    }

    return out;
}

/**
 * @param data {object} cleaned JC data
 * @param results {object} prior API call results (used to preserve osf/zotero on an edit commit)
 * @param opts {{editToken?: object|null, dir?: string}}
 */
async function callGitHub(data, results, opts = {}) {
    const { editToken = null, dir = '_journal-clubs' } = opts;
    const { GITHUB_TOKEN, GITHUB_API_USER } = process.env;
    let { GITHUB_REPO_API } = process.env;
    const out = { title: 'GitHub', status: 'Okay', details: [] };
    const url = `${GITHUB_REPO_API}/contents/${dir}`;

    let sha;
    try {
        const call = await fetch(url, { headers: { 'User-Agent': GITHUB_API_USER } });
        if (!call.ok) throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        const response = await call.json();

        for (const jc of response) {
            if (jc.name === `${data.jcid}.md`) {
                if (editToken) {
                    await fetch(`${url}/${encodeURI(jc.name)}`, {
                        headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}` }
                    })
                        .then(r => {
                            if (r.status === 200) return r.json();
                            throw new Error(`Could not lookup existing JC: ${r.statusText} (${r.status})`);
                        })
                        .then(f => {
                            const body = Buffer.from(f.content, 'base64').toString('utf8');
                            const osf = /^osf: "?(.*)"?$/m.exec(body);
                            const zotero = /^zotero: "?(.*)"?$/m.exec(body);
                            results = { osf: { osfRepoId: osf ? osf[1] : null }, zotero: { zoteroCollectionId: zotero ? zotero[1] : null } };
                            sha = f.sha;
                        });
                    break;
                }
                out.status = 'Warning';
                out.details.push(`${data.jcid}.md already exists: a new version will not be created.`);
                return out;
            }
        }
    } catch (e) {
        out.status = 'Warning';
        out.details.push('An error occurred while accessing the repository. ' + e.toString());
        return out;
    }

    const frontmatter = {
        jcid: data.jcid,
        title: data.name,
        'host-organisation': data.uni,
        'host-org-url': data.uniWWW,
        osf: results?.osf?.osfRepoId ?? data.osf ?? '',
        zotero: results?.zotero?.zoteroCollectionId ?? '',
        website: data.www,
        twitter: data.twitter,
        signup: data.signup,
        organisers: [data.lead, ...data.helpers],
        contact: data.email,
        'additional-contact': data.emails,
        address: data.post.split(/[\n,]+/).map(s => s.trim()),
        country: data.country,
        geolocation: data.geolocation,
        'last-message-timestamp': Math.floor(Date.now() / 1000),
        'last-message-level': 0,
        'last-update': editToken ? editToken.email : data.email,
        'last-update-timestamp': Math.floor(Date.now() / 1000),
        'last-update-message': (editToken ? editToken.message : 'API creation').replace(/\n */g, '\n ')
    };

    const yaml = YAML.stringify(frontmatter);
    out.githubFile = `---\n\n${yaml}\n\n---\n\n${data.description}\n`;

    const commitBody = editToken
        ? { message: `Form update of ${data.jcid}.md by ${editToken.email}.\n${editToken.message}`, content: Buffer.from(out.githubFile, 'utf8').toString('base64'), sha }
        : { message: `Creation of ${data.jcid}.md`, content: Buffer.from(out.githubFile, 'utf8').toString('base64') };

    try {
        const call = await fetch(`${url}/${data.jcid}.md`, {
            method: 'PUT',
            headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(commitBody)
        });
        if (!call.ok) throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        await call.json();

        const verb = editToken ? 'Updated' : 'Created';
        out.details.push(`${verb} ${data.jcid}.md. See <a href="https://reproducibiliTea.org/journal-clubs/#${encodeURI(data.name)}" target="_blank">https://reproducibiliTea.org/journal-clubs/#${encodeURI(data.name)}</a> once it goes live.`);
    } catch (e) {
        out.status = 'Warning';
        out.details.push('An error occurred while creating JC.md file: ' + e.toString());
        return out;
    }

    return out;
}

/**
 * Notify every admin address with a creation report and an approve-link token.
 * @param {{data: object, results: object, approveToken: string, adminEmails: string[], mailgunConfig: {apiKey, domain, fromEmail}}} args
 */
async function notifyAdmins({ data, results, approveToken, adminEmails, mailgunConfig }) {
    const out = { title: 'Admin notification', status: 'Okay', details: [] };
    const reviewUrl = `https://reproducibiliTea.org/.netlify/functions/new-jc_approve?token=${approveToken}`;

    try {
        await sendEmail({
            apiKey: mailgunConfig.apiKey,
            domain: mailgunConfig.domain,
            from: mailgunConfig.fromEmail,
            to: adminEmails.join(', '),
            subject: `New ReproducibiliTea pending review: ${data.name}`,
            html: `
<p>A new ReproducibiliTea journal club is awaiting review: <strong>${data.name}</strong>.</p>
<p><a href="${reviewUrl}">Review ${data.name}</a> (link expires in 14 days)</p>
<h1>Creation report</h1>
${formatResponses(results)}
<h2>Generated JC.md file</h2>
${(results.github?.githubFile || '').replace(/\n/g, '<br />')}
            `
        });
        out.details.push(`Sent review request to ${adminEmails.join(', ')}.`);
    } catch (e) {
        out.status = 'Error';
        out.details.push('Failed to notify admins: ' + e.toString());
    }

    return out;
}

module.exports = { callSlack, callZotero, callGitHub, notifyAdmins, formatResponses };
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/jc-integrations.js
git commit -m "Extract Slack/Zotero/GitHub integrations, drop OSF and manual Content-Length"
```

---

### Task 4: Rewrite `src/new-jc.js` — edits unchanged in effect, creation now requests confirmation

**Files:**
- Modify: `src/new-jc.js` (full rewrite)

**Interfaces:**
- Consumes: `cleanData`, `checkData` from `./lib/jc-validation` (Task 1); `callGitHub` from `./lib/jc-integrations` (Task 3); `signToken`, `verifyToken` from `./lib/tokens` (signed-edit-tokens plan); `sendEmail` from `./lib/mailer` (Task 2).
- Produces: Netlify function `exports.handler(event) -> Promise<{statusCode, body}>`, same endpoint (`/.netlify/functions/new-jc`) and request-shape contract the frontend (`join-form.js`) already uses: presence of `data.editToken` (a JSON string `{token}`) means "edit an existing JC"; its absence means "request creation of a new JC."

No unit test for this task — it's an HTTP handler wiring together already-tested modules with no new branching logic of its own beyond a single `if (data.editToken)` check, which Task 5/6's manual verification covers end to end.

- [ ] **Step 1: Replace the file contents**

Replace all of `src/new-jc.js` with:
```js
require('dotenv').config();
const { cleanData, checkData } = require('./lib/jc-validation');
const { callGitHub, formatResponses } = require('./lib/jc-integrations');
const { signToken, verifyToken } = require('./lib/tokens');
const { sendEmail } = require('./lib/mailer');

const CONFIRM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

exports.handler = async (event) => {
    console.log(JSON.stringify({ event: 'new_jc_request_received' }));
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed', headers: { Allow: 'POST' } };
    }

    let data;
    try {
        data = cleanData(JSON.parse(event.body));
    } catch (e) {
        return { statusCode: 400, body: '<p>Could not clean submission for processing</p>' };
    }

    const rawEditToken = data.editToken;
    if (rawEditToken) {
        return handleEdit(data, rawEditToken);
    }
    return handleCreationRequest(data);
};

async function handleEdit(data, rawEditToken) {
    let parsedToken;
    try {
        parsedToken = JSON.parse(rawEditToken).token;
    } catch (e) {
        return { statusCode: 400, body: formatResponses({ checkToken: { title: 'Check edit token', status: 'Error', details: ['Malformed edit token.'] } }) };
    }

    const result = verifyToken(parsedToken, process.env.EDIT_TOKEN_SECRET);
    if (!result.valid) {
        return {
            statusCode: 401,
            body: formatResponses({ checkToken: { title: 'Check edit token', status: 'Error', details: [`Token invalid: ${result.reason}`] } })
        };
    }

    data.jcid = result.payload.jcid;
    const check = checkData(data);
    if (check !== null) {
        return { statusCode: 400, body: formatResponses({ check: { title: 'Data check', status: 'Error', details: [check] } }) };
    }

    const github = await callGitHub(data, null, { editToken: result.payload });
    console.log(JSON.stringify({ event: 'new_jc_edit_committed', jcid: data.jcid, status: github.status }));
    return { statusCode: 200, body: formatResponses({ github }) };
}

async function handleCreationRequest(data) {
    const check = checkData(data);
    if (check !== null) {
        return { statusCode: 400, body: formatResponses({ check: { title: 'Data check', status: 'Error', details: [check] } }) };
    }

    const token = signToken({ purpose: 'creation-confirm', data }, process.env.EDIT_TOKEN_SECRET, { expiresInMs: CONFIRM_TOKEN_TTL_MS });
    const confirmUrl = `https://reproducibiliTea.org/.netlify/functions/new-jc_confirm?token=${token}`;

    try {
        await sendEmail({
            apiKey: process.env.MAILGUN_API_KEY,
            domain: process.env.MAILGUN_DOMAIN,
            from: process.env.FROM_EMAIL_ADDRESS,
            to: data.email,
            subject: `Confirm your new ReproducibiliTea journal club: ${data.name}`,
            html: `
<p>Thanks for setting up a ReproducibiliTea journal club! Please confirm your request by following the link below:</p>
<p><a href="${confirmUrl}">Confirm ${data.name}</a></p>
<p>This link will expire in 24h. Once confirmed, our steering committee will review and approve your journal club before it goes live.</p>
            `
        });
    } catch (e) {
        console.log(JSON.stringify({ event: 'new_jc_request_email_failed', error: e.message }));
        return { statusCode: 500, body: formatResponses({ email: { title: 'Confirmation email', status: 'Error', details: [e.message] } }) };
    }

    console.log(JSON.stringify({ event: 'new_jc_request_sent', jcid: data.jcid, email: data.email }));
    return {
        statusCode: 200,
        body: formatResponses({ request: { title: 'Confirmation sent', status: 'Okay', details: [`Check ${data.email} for a confirmation link.`] } })
    };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/new-jc.js
git commit -m "Split new-jc.js: edits verify tokens in-process, creation now requests email confirmation"
```

---

### Task 5: `src/new-jc_confirm.js`

**Files:**
- Create: `src/new-jc_confirm.js`

**Interfaces:**
- Consumes: `verifyToken`, `signToken` from `./lib/tokens`; `callSlack`, `callZotero`, `callGitHub`, `notifyAdmins`, `formatResponses` from `./lib/jc-integrations` (Task 3); `checkData` from `./lib/jc-validation` (Task 1, defence-in-depth re-check since the token could be old).
- Produces: Netlify function `exports.handler(event) -> Promise<{statusCode, body}>`, triggered by a `GET` with `?token=...` (the link emailed in Task 4's `handleCreationRequest`).

No unit test — same reasoning as Task 3/4 (all branches are network calls). Verified manually in Task 6.

- [ ] **Step 1: Implement it**

Create `src/new-jc_confirm.js`:
```js
require('dotenv').config();
const { checkData } = require('./lib/jc-validation');
const { callSlack, callZotero, callGitHub, notifyAdmins, formatResponses } = require('./lib/jc-integrations');
const { verifyToken, signToken } = require('./lib/tokens');

const APPROVE_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days — a review with a written message takes longer than a click

exports.handler = async (event) => {
    const token = event.queryStringParameters?.token;
    if (!token) {
        return { statusCode: 400, body: '<p>Missing confirmation token.</p>' };
    }

    const result = verifyToken(token, process.env.EDIT_TOKEN_SECRET);
    if (!result.valid || result.payload.purpose !== 'creation-confirm') {
        return { statusCode: 401, body: `<p>Confirmation link invalid or expired (${result.reason || 'wrong purpose'}).</p>` };
    }

    const data = result.payload.data;
    const check = checkData(data);
    if (check !== null) {
        return { statusCode: 400, body: `<p>${check}</p>` };
    }

    const [slack, zotero] = await Promise.all([callSlack(data), callZotero(data)]);
    const results = { slack, zotero };
    results.github = await callGitHub(data, results, { dir: '_pending-journal-clubs' });

    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
    const approveToken = signToken({ purpose: 'admin-approve', jcid: data.jcid }, process.env.EDIT_TOKEN_SECRET, { expiresInMs: APPROVE_TOKEN_TTL_MS });
    results.adminNotification = await notifyAdmins({
        data,
        results,
        approveToken,
        adminEmails,
        mailgunConfig: { apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN, fromEmail: process.env.FROM_EMAIL_ADDRESS }
    });

    console.log(JSON.stringify({ event: 'new_jc_confirmed', jcid: data.jcid, githubStatus: results.github.status }));
    return { statusCode: 200, body: `<p>Thanks! Your journal club has been submitted for approval.</p>${formatResponses(results)}` };
};
```

- [ ] **Step 2: Commit**

```bash
git add src/new-jc_confirm.js
git commit -m "Add new-jc_confirm: create the pending JC and request admin approval"
```

---

### Task 6: `src/new-jc_approve.js` — review page (GET) + approve/reject/ignore action (POST)

**Files:**
- Create: `src/new-jc_approve.js`

**Interfaces:**
- Consumes: `verifyToken` from `./lib/tokens`; `sendEmail` from `./lib/mailer` (Task 2).
- Produces: Netlify function `exports.handler(event) -> Promise<{statusCode, body}>`, triggered by `GET ?token=...` (renders the review page) and `POST ?token=...` with a form body `action=approve|reject|ignore&message=...` (performs the action). Both are the same URL emailed by Task 5's `notifyAdmins`.

Directory semantics: a pending JC lives at `_pending-journal-clubs/<jcid>.md`. Approve moves it to `_journal-clubs/<jcid>.md` (goes live). Reject deletes it outright. Ignore moves it to `_pending-journal-clubs/ignored/<jcid>.md` and adds `ignored: true` to its frontmatter — still reachable by re-visiting the same link, so an admin can revisit and approve/reject something they'd ignored. Re-ignoring an already-ignored item is a no-op (skip the GitHub commit; nothing to move). GitHub's Contents API has no atomic rename, so every move is create-at-destination-then-delete-source — a failure after the create leaves a harmless duplicate rather than losing the file.

No unit test — network-call-only logic. Verify manually per Step 3 below.

- [ ] **Step 1: Implement it**

Create `src/new-jc_approve.js`:
```js
require('dotenv').config();
const fetch = require('node-fetch');
const YAML = require('yaml');
const { verifyToken } = require('./lib/tokens');
const { sendEmail } = require('./lib/mailer');

const PENDING_DIR = '_pending-journal-clubs';
const IGNORED_DIR = `${PENDING_DIR}/ignored`;
const ACTIVE_DIR = '_journal-clubs';

exports.handler = async (event) => {
    const token = event.queryStringParameters?.token;
    if (!token) return { statusCode: 400, body: '<p>Missing approval token.</p>' };

    const result = verifyToken(token, process.env.EDIT_TOKEN_SECRET);
    if (!result.valid || result.payload.purpose !== 'admin-approve') {
        return { statusCode: 401, body: `<p>Review link invalid or expired (${result.reason || 'wrong purpose'}).</p>` };
    }
    const { jcid } = result.payload;

    const file = await fetchPending(jcid);
    if (!file) {
        return { statusCode: 404, body: `<p>${jcid} is no longer pending (already approved/rejected, or the link is stale).</p>` };
    }

    if (event.httpMethod === 'GET') {
        return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: renderActionPage(file.frontmatter.title || jcid, token) };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed', headers: { Allow: 'GET, POST' } };
    }

    const form = new URLSearchParams(event.body);
    const message = (form.get('message') || '').trim();
    switch (form.get('action')) {
        case 'approve': return doApprove(jcid, file, message);
        case 'reject': return doReject(jcid, file, message);
        case 'ignore': return doIgnore(jcid, file);
        default: return { statusCode: 400, body: '<p>Unknown action.</p>' };
    }
};

async function fetchPending(jcid) {
    const { GITHUB_TOKEN, GITHUB_API_USER, GITHUB_REPO_API } = process.env;
    for (const dir of [PENDING_DIR, IGNORED_DIR]) {
        const res = await fetch(`${GITHUB_REPO_API}/contents/${dir}/${jcid}.md`, {
            headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}` }
        });
        if (res.ok) {
            const json = await res.json();
            const body = Buffer.from(json.content, 'base64').toString('utf8');
            const fm = /^---\s*\n([\s\S]*?)\n---/.exec(body);
            return { dir, sha: json.sha, body, frontmatter: fm ? YAML.parse(fm[1]) : {} };
        }
    }
    return null;
}

function renderActionPage(title, token) {
    return `<!DOCTYPE html><html><body>
<h1>Review ${title}</h1>
<form method="POST" action="?token=${encodeURIComponent(token)}">
    <label><input type="radio" name="action" value="approve" checked> Approve</label><br>
    <label><input type="radio" name="action" value="reject"> Reject</label><br>
    <label><input type="radio" name="action" value="ignore"> Ignore</label><br>
    <label>Message to organiser(s) (approve/reject only, emailed verbatim):<br>
        <textarea name="message" rows="6" cols="60"></textarea></label><br>
    <button type="submit">Submit</button>
</form>
</body></html>`;
}

async function putFile(path, content, sha, message) {
    const { GITHUB_TOKEN, GITHUB_API_USER, GITHUB_REPO_API } = process.env;
    const body = { message, content: Buffer.from(content, 'utf8').toString('base64') };
    if (sha) body.sha = sha;
    const res = await fetch(`${GITHUB_REPO_API}/contents/${path}`, {
        method: 'PUT',
        headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
}

async function deleteFile(path, sha, message) {
    const { GITHUB_TOKEN, GITHUB_API_USER, GITHUB_REPO_API } = process.env;
    const res = await fetch(`${GITHUB_REPO_API}/contents/${path}`, {
        method: 'DELETE',
        headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sha })
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
}

async function doApprove(jcid, file, message) {
    const to = [file.frontmatter.contact, ...(file.frontmatter['additional-contact'] || [])].filter(Boolean);
    try {
        await putFile(`${ACTIVE_DIR}/${jcid}.md`, file.body, null, `Approve ${jcid}.md`);
        await deleteFile(`${file.dir}/${jcid}.md`, file.sha, `Approve ${jcid}.md (remove from pending)`);
    } catch (e) {
        return { statusCode: 500, body: `<p>Could not approve ${jcid}: ${e.message}</p>` };
    }

    await sendEmail({
        apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN, from: process.env.FROM_EMAIL_ADDRESS,
        to: to.join(', '), bcc: process.env.EMAIL_REPORT_TO,
        subject: `Your ReproducibiliTea journal club has been approved: ${file.frontmatter.title}`,
        html: `<p>Good news — <strong>${file.frontmatter.title}</strong> has been approved and is now live.</p>${message ? `<p>${message}</p>` : ''}`
    });

    console.log(JSON.stringify({ event: 'new_jc_approved', jcid }));
    return { statusCode: 200, body: `<p>${jcid} approved and now live.</p>` };
}

async function doReject(jcid, file, message) {
    try {
        await deleteFile(`${file.dir}/${jcid}.md`, file.sha, `Reject ${jcid}.md`);
    } catch (e) {
        return { statusCode: 500, body: `<p>Could not reject ${jcid}: ${e.message}</p>` };
    }

    await sendEmail({
        apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN, from: process.env.FROM_EMAIL_ADDRESS,
        to: file.frontmatter.contact, bcc: process.env.EMAIL_REPORT_TO,
        subject: `Your ReproducibiliTea journal club request: ${file.frontmatter.title}`,
        html: `<p>Thanks for your interest in setting up <strong>${file.frontmatter.title}</strong>. Unfortunately we won't be taking this request forward.</p>${message ? `<p>${message}</p>` : ''}`
    });

    console.log(JSON.stringify({ event: 'new_jc_rejected', jcid }));
    return { statusCode: 200, body: `<p>${jcid} rejected.</p>` };
}

async function doIgnore(jcid, file) {
    if (file.dir === IGNORED_DIR) {
        return { statusCode: 200, body: `<p>${jcid} was already ignored.</p>` };
    }

    const ignoredBody = file.body.replace(/^---\s*\n/, '---\n\nignored: true\n');
    try {
        await putFile(`${IGNORED_DIR}/${jcid}.md`, ignoredBody, null, `Ignore ${jcid}.md`);
        await deleteFile(`${file.dir}/${jcid}.md`, file.sha, `Ignore ${jcid}.md (remove from pending)`);
    } catch (e) {
        return { statusCode: 500, body: `<p>Could not ignore ${jcid}: ${e.message}</p>` };
    }

    await sendEmail({
        apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN, from: process.env.FROM_EMAIL_ADDRESS,
        to: process.env.EMAIL_REPORT_TO,
        subject: `ReproducibiliTea JC request ignored: ${file.frontmatter.title}`,
        html: `<p><strong>${file.frontmatter.title}</strong> (${jcid}) was marked ignored by an admin. No email was sent to the requester.</p>`
    });

    console.log(JSON.stringify({ event: 'new_jc_ignored', jcid }));
    return { statusCode: 200, body: `<p>${jcid} ignored.</p>` };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/new-jc_approve.js
git commit -m "Add new-jc_approve: review page plus approve/reject/ignore actions"
```

- [ ] **Step 3: Manual end-to-end verification (not a code step)**

Against the sandbox GitHub repo/account:
1. POST a valid creation payload (no `editToken`) to `/.netlify/functions/new-jc` — confirm you receive a "check your email" response and an email with a confirm link arrives.
2. Visit the confirm link — confirm `_pending-journal-clubs/<jcid>.md` is created on the sandbox repo, and a review email arrives at the `ADMIN_EMAILS` addresses.
3. Visit the review link — confirm the GET page renders with all three action options and a message box.
4. Submit **approve** with a message — confirm the file moves to `_journal-clubs/<jcid>.md` (two commits), and the requester's `contact` + `additional-contact` addresses receive the message, bcc'd to `EMAIL_REPORT_TO`.
5. Repeat steps 1-3 for a second JC, submit **reject** with a message — confirm the pending file is deleted and only `contact` receives the message, bcc'd to `EMAIL_REPORT_TO`.
6. Repeat again, submit **ignore** — confirm the file moves to `_pending-journal-clubs/ignored/<jcid>.md` with `ignored: true`, no email reaches the requester, and `EMAIL_REPORT_TO` gets the ignore notice. Re-visit the same link and ignore again — confirm it's a no-op, not an error.
7. Repeat an edit (existing flow, via `edit-jc.html` → `join-reproducibiliTea.html?jcEditToken=...`) and confirm it still works unchanged.

---

### Task 7: Frontend — remove `AUTH_CODE`/`osfUser`, fix the resulting dead code

**Files:**
- Modify: `join-reproducibiliTea.html`
- Modify: `assets/js/join-form.js`

**Interfaces:** none (HTML/JS cleanup); this task must ship in the same commit as Task 4-6 or creation requests will 400 (the frontend would still submit an `authCode` field the backend no longer expects — harmless, since `checkData` no longer requires it — but the removed OSF-project promise in the copy would be misleading if left live before the backend catches up).

- [ ] **Step 1: Remove the `AuthCodeRow` field**

In `join-reproducibiliTea.html`, delete this block (currently lines 561-573):
```html
                <div id="AuthCodeRow" class="row mandatory">
                    <div class="labels">
                        <label for="authCode">Authorization code</label>
                        <div class="label-details">
                            <p>To prevent just anyone spamming this form with new JC requests, we need you to submit the password given to you by one of the core ReproducibiliTea team.</p>
                            <ul>
                                <li class="private">This will only be used for adding you as a contributor. It will not be saved.</li>
                                <li class="is-mandatory">This field is required.</li>
                            </ul>
                        </div>
                    </div>
                    <input type="text" id="authCode" name="authCode" placeholder="????????" />
                </div>

```

- [ ] **Step 2: Remove the `osfUserRow` field**

Delete this block (currently lines 527-540):
```html
                <div class="row" id="osfUserRow">
                    <div class="labels">
                        <label for="osfUser">Lead organiser <a href="https://osf.io/">OSF</a> id</label>
                        <div class="label-details">
                            <p>This is the OSF id for the organiser we'll add as a contributor on the OSF page we'll create for your JC.</p>
                            <p>You can find your OSF id by logging in and going to your profile (click the menu in the top-right, and select '<strong>profile</strong>'), then choosing '<strong>public profile</strong>'. The second part of that URL, after the osf.io/, is your OSF id.</p>
                            <ul>
                                <li class="private">This will only be used for adding you as a contributor. It will not be saved.</li>
                                <li class="is-mandatory">This field is optional.</li>
                            </ul>
                        </div>
                    </div>
                    <input type="text" id="osfUser" name="osfUser" placeholder="a9b2z" />
                </div>

```

- [ ] **Step 3: Remove references to the deleted rows in `acceptToken()`**

In the `<script>` block, find:
```js
        // Remove the unneeded fields
        document.getElementById('AuthCodeRow').remove();
        document.getElementById('osfUserRow').remove();
        document.getElementById('zoteroUserRow').remove();
```
Replace with:
```js
        // Remove the unneeded field
        document.getElementById('zoteroUserRow').remove();
```

- [ ] **Step 4: Update the step-1 welcome copy**

Find (currently line 12):
```html
        <p>Use this form to create a new <strong>ReproducibiliTea</strong> journal club. We assume you are here after consulting our steering committee, and are ready to take on the exciting challenge of running your own journal club. Once you complete the form on this page, we'll automatically add you to our list of journal clubs, create you a page on the website, initialise an OSF repository for you, and invite you to the Slack workspace.</p>
```
Replace with:
```html
        <p>Use this form to create a new <strong>ReproducibiliTea</strong> journal club. Once you complete the form on this page, we'll email you a confirmation link; after you confirm, our steering committee reviews the request and your journal club goes live on the website, in the Zotero library, and the Slack workspace.</p>
```

- [ ] **Step 5: Remove the OSF-project promise from the platforms table**

Find (currently lines 35-38):
```html
                <td>
                    <p>The Open Science Framework (OSF) provides storage for various kinds of files. We have a main <a href="https://osf.io/3qrj6/" target="_blank">ReproducibiliTea project <sup><i class="fas fa-external-link-square-alt"></i></sup></a> and each of the journal clubs have their own repository within it.</p>
                    <p> We will create a repository for your journal club automatically and make you the repository admin. You can then manage it as you see fit. But to do this we will need your OSF profile ID (a few letters and numbers looking like '3qrj6') so you will need to have <a href="https://osf.io/register" target="_blank">created an OSF account <sup><i class="fas fa-external-link-square-alt"></i></sup></a></strong> and know your profile ID . Don't worry if you can't find your ID now, we'll explain how to find it in Step 3.</p>

                </td>
```
Replace with:
```html
                <td>
                    <p>The Open Science Framework (OSF) provides storage for various kinds of files. We have a main <a href="https://osf.io/3qrj6/" target="_blank">ReproducibiliTea project <sup><i class="fas fa-external-link-square-alt"></i></sup></a>. If your journal club already has (or wants) its own OSF repository, you can link it in Step 3 — we no longer create one automatically.</p>
                </td>
```

- [ ] **Step 6: Fix the now-dead `osfUser`-obsolete-marking code in `join-form.js`**

In `assets/js/join-form.js`'s `checkForm` function, find:
```js
    // Mark OSFuser obsolete if OSF is complete
    if(!window.jcEditToken) {
        let elm = document.querySelector('#osfUser').closest('.row');
        if(document.querySelector('#osf').value != "") {
            elm.classList.add('obsolete');
            elm.title = "This field is unavailable when a custom OSF repository has been supplied."
        } else {
            elm.classList.remove('obsolete');
            elm.title = "";
        }
    }

```
Delete this block entirely — `#osfUser` no longer exists in the form, so `document.querySelector('#osfUser').closest('.row')` would throw `TypeError: Cannot read properties of null` on every form change once the field is removed.

- [ ] **Step 7: Manual browser verification**

Load `/join-reproducibiliTea/` locally (`npm run serve`), confirm: no `AuthCodeRow`/`osfUserRow` visible, no console errors on typing into any field, submitting shows the "check your email" response from Task 4.

- [ ] **Step 8: Commit**

```bash
git add join-reproducibiliTea.html assets/js/join-form.js
git commit -m "Remove AUTH_CODE and osfUser fields from the creation form"
```

---

### Task 8: (dropped) Hiding pending JCs from public pages is no longer needed

Superseded by the `_pending-journal-clubs/` directory design (see Architecture, above, and Task 6). Pending and ignored JCs are never written into `_journal-clubs/`, so `site.journal-clubs` never contains them — no Liquid filtering required in `jc-templates.html`, `jc-showcase.html`, `jc-map.html`, `map.html`, `about.md`, or `index.md`. `jc-overview.html` is likewise left untouched: per the design decision, browsing pending/ignored requests there is out of scope — the emailed review link (Task 6) is the only way to see and act on one.

---

### Task 9: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update env var docs**

Add to the "Netlify functions" section of `README.md`:
```markdown
- `ADMIN_EMAILS`: comma-separated list of addresses that receive new-JC review requests.
- `EMAIL_REPORT_TO`: the central ReproducibiliTea account, bcc'd on every approve/reject email and the sole recipient of ignore notifications.
- `GITHUB_API_USER`, `GITHUB_TOKEN`, `GITHUB_REPO_API` (and `GITHUB_REPO_API_SANDBOX` for local/sandbox testing): unchanged, used to read/write `_journal-clubs/*.md` and `_pending-journal-clubs/*.md`.

`AUTH_CODE` is no longer used and can be removed — JC creation now uses email confirmation + admin review instead of a shared password.

New JCs are held in `_pending-journal-clubs/` (and `_pending-journal-clubs/ignored/` once ignored) until an admin approves them via the reviewed link, at which point they're moved into `_journal-clubs/` and go live. Neither pending directory is a Jekyll collection — same convention as the existing `_inactive-journal-clubs/` archive — so nothing in either is ever built onto the public site.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document ADMIN_EMAILS, note AUTH_CODE is no longer used"
```

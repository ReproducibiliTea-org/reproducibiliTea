require('dotenv').config();
const fetch = require('node-fetch');
const YAML = require('yaml');
const { verifyToken } = require('./lib/tokens');
const { sendEmail } = require('./lib/mailer');
const { escapeHtml } = require('./lib/html-escape');
const { logMisconfigured } = require('./lib/env-diagnostics');
const { repoConfig } = require('./lib/github-repos');
const { callSlack, callZotero, formatResponses, deleteConfirmResult } = require('./lib/jc-integrations');

const PENDING_DIR = '_pending-journal-clubs';
const IGNORED_DIR = `${PENDING_DIR}/ignored`;
const ACTIVE_DIR = '_journal-clubs';
const REVIEW_PAGE = 'https://reproducibiliTea.org/jc-review.html';
const STATUS_PAGE = 'https://reproducibiliTea.org/jc-review-status.html';

// Every outcome sends the admin to a styled static page instead of a bare
// HTML fragment rendered by the function itself.
function redirectTo(page, params = {}) {
    const query = new URLSearchParams(params);
    return { statusCode: 302, headers: { Location: `${page}?${query.toString()}` } };
}

exports.handler = async (event) => {
    if (!process.env.EDIT_TOKEN_SECRET) {
        logMisconfigured('new_jc_approve_misconfigured');
        return redirectTo(STATUS_PAGE, { status: 'server-error' });
    }

    const token = event.queryStringParameters?.token;
    if (!token) return redirectTo(STATUS_PAGE, { status: 'missing-token' });

    const result = verifyToken(token, process.env.EDIT_TOKEN_SECRET);
    if (!result.valid || result.payload.purpose !== 'admin-approve') {
        return redirectTo(STATUS_PAGE, { status: 'invalid-token', reason: result.reason || 'wrong purpose' });
    }
    const { jcid } = result.payload;

    // Clicked from an email, so no usable referer — the sandbox flag rides along
    // in the signed token, threaded through from the original creation request.
    if (result.payload.sandbox) {
        process.env.GITHUB_REPO_API = process.env.GITHUB_REPO_API_SANDBOX;
        process.env.GITHUB_REPO_API_PENDING = process.env.GITHUB_REPO_API_PENDING_SANDBOX;
    }

    let state;
    try {
        state = await resolveState(jcid);
    } catch (e) {
        console.log(JSON.stringify({ event: 'new_jc_approve_state_check_failed', jcid, error: e.message }));
        return redirectTo(STATUS_PAGE, { status: 'server-error' });
    }

    if (event.httpMethod === 'GET') {
        if (state.state === 'pending') {
            return redirectTo(REVIEW_PAGE, { token, jcid, title: state.file.frontmatter.title || jcid });
        }
        return redirectTo(STATUS_PAGE, { status: state.state, jcid, title: state.title || jcid });
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed', headers: { Allow: 'GET, POST' } };
    }

    // A revisited/double-submitted link: the token is still valid but the
    // request has already been actioned. Report the real outcome rather than
    // re-running (or erroring on) an action that's already happened.
    if (state.state !== 'pending') {
        return redirectTo(STATUS_PAGE, { status: state.state, jcid, title: state.title || jcid });
    }

    const form = new URLSearchParams(event.body);
    const message = (form.get('message') || '').trim();
    switch (form.get('action')) {
        case 'approve': return doApprove(jcid, state.file, message);
        case 'reject': return doReject(jcid, state.file, message);
        case 'ignore': return doIgnore(jcid, state.file);
        default: return redirectTo(STATUS_PAGE, { status: 'unknown-action', jcid });
    }
};

/**
 * Where a jcid's review request currently stands: still awaiting review, or
 * one of the three outcomes an admin action (or a previous visit to this
 * same link) has already produced.
 * @return {Promise<{state: 'pending', file: object}|{state: 'ignored', title: string, file: object}|{state: 'approved', title: string}|{state: 'rejected'}>}
 */
async function resolveState(jcid) {
    const file = await fetchPending(jcid);
    if (file && file.dir === PENDING_DIR) return { state: 'pending', file };
    if (file && file.dir === IGNORED_DIR) return { state: 'ignored', title: file.frontmatter.title, file };

    // Not pending or ignored: it was either approved (now live) or rejected
    // (deleted outright, no trace left behind) — the only two remaining
    // outcomes doApprove/doReject/doIgnore can produce.
    const live = await fetchLive(jcid);
    return live.exists ? { state: 'approved', title: live.title } : { state: 'rejected' };
}

async function fetchPending(jcid) {
    const { token: GITHUB_TOKEN, repoApi: GITHUB_REPO_API, userAgent: GITHUB_API_USER } = repoConfig('pending');
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

/** @return {Promise<{exists: boolean, title?: string}>} whether `_journal-clubs/<jcid>.md` is live, and its title if so */
async function fetchLive(jcid) {
    const { token: GITHUB_TOKEN, repoApi: GITHUB_REPO_API, userAgent: GITHUB_API_USER } = repoConfig('public');
    const res = await fetch(`${GITHUB_REPO_API}/contents/${ACTIVE_DIR}/${jcid}.md`, {
        headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}` }
    });
    if (res.status === 404) return { exists: false };
    if (!res.ok) throw new Error(`Server response: ${res.status}: ${res.statusText}`);
    const json = await res.json();
    const body = Buffer.from(json.content, 'base64').toString('utf8');
    const fm = /^---\s*\n([\s\S]*?)\n---/.exec(body);
    return { exists: true, title: fm ? YAML.parse(fm[1]).title : jcid };
}

async function putFile(path, content, sha, message, target = 'public') {
    const { token: GITHUB_TOKEN, repoApi: GITHUB_REPO_API, userAgent: GITHUB_API_USER } = repoConfig(target);
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

async function deleteFile(path, sha, message, target = 'public') {
    const { token: GITHUB_TOKEN, repoApi: GITHUB_REPO_API, userAgent: GITHUB_API_USER } = repoConfig(target);
    const res = await fetch(`${GITHUB_REPO_API}/contents/${path}`, {
        method: 'DELETE',
        headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sha })
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
}

// Best-effort: the recorded confirm-result is only there so a repeat visit to
// the confirm link can replay it (see new-jc_confirm.js) — once an admin has
// acted, that replay path is moot, but a failure to clean it up shouldn't
// block or fail the admin action itself.
async function cleanupConfirmResult(jcid, event) {
    try {
        await deleteConfirmResult(jcid);
    } catch (e) {
        console.log(JSON.stringify({ event, jcid, error: e.message }));
    }
}

async function doApprove(jcid, file, message) {
    const to = [file.frontmatter.contact, ...(file.frontmatter['additional-contact'] || [])].filter(Boolean);

    // Slack invite + Zotero collection creation happen now, at approval, not at
    // confirm time — a pending request that's rejected or ignored never touches
    // either. `zotero-user` only ever lived on the pending file to carry this
    // through; it's stripped before the file goes public.
    const jcData = { name: file.frontmatter.title, zoteroUser: file.frontmatter['zotero-user'] || '' };
    const [slack, zotero] = await Promise.all([callSlack(jcData), callZotero(jcData)]);

    const activeBody = file.body
        .replace(/^ignored: true\n/m, '')
        .replace(/^zotero-user:.*\n/m, '');
    try {
        await putFile(`${ACTIVE_DIR}/${jcid}.md`, activeBody, null, `Approve ${jcid}.md`, 'public');
        await deleteFile(`${file.dir}/${jcid}.md`, file.sha, `Approve ${jcid}.md (remove from pending)`, 'pending');
    } catch (e) {
        console.log(JSON.stringify({ event: 'new_jc_approve_failed', jcid, error: e.message }));
        return redirectTo(STATUS_PAGE, { status: 'approve-failed', jcid, title: file.frontmatter.title, reason: e.message });
    }
    console.log(JSON.stringify({ event: 'new_jc_approved', jcid }));
    await cleanupConfirmResult(jcid, 'new_jc_approve_confirm_result_cleanup_failed');

    const params = { status: 'approved', jcid, title: file.frontmatter.title };
    try {
        await sendEmail({
            apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN, from: process.env.FROM_EMAIL_ADDRESS,
            to: to.join(', '), bcc: process.env.EMAIL_REPORT_TO,
            subject: `Your ReproducibiliTea journal club has been approved: ${file.frontmatter.title}`,
            html: `<p>Good news — <strong>${escapeHtml(file.frontmatter.title)}</strong> has been approved and is now live.</p>${message ? `<p>${escapeHtml(message)}</p>` : ''}${formatResponses({ slack, zotero })}`
        });
    } catch (e) {
        console.log(JSON.stringify({ event: 'new_jc_approve_notify_failed', jcid, error: e.message }));
        params.notifyFailed = '1';
    }
    return redirectTo(STATUS_PAGE, params);
}

async function doReject(jcid, file, message) {
    try {
        await deleteFile(`${file.dir}/${jcid}.md`, file.sha, `Reject ${jcid}.md`, 'pending');
    } catch (e) {
        console.log(JSON.stringify({ event: 'new_jc_reject_failed', jcid, error: e.message }));
        return redirectTo(STATUS_PAGE, { status: 'reject-failed', jcid, title: file.frontmatter.title, reason: e.message });
    }
    console.log(JSON.stringify({ event: 'new_jc_rejected', jcid }));
    await cleanupConfirmResult(jcid, 'new_jc_reject_confirm_result_cleanup_failed');

    const params = { status: 'rejected', jcid, title: file.frontmatter.title };
    try {
        await sendEmail({
            apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN, from: process.env.FROM_EMAIL_ADDRESS,
            to: file.frontmatter.contact, bcc: process.env.EMAIL_REPORT_TO,
            subject: `Your ReproducibiliTea journal club request: ${file.frontmatter.title}`,
            html: `<p>Thanks for your interest in setting up <strong>${escapeHtml(file.frontmatter.title)}</strong>. Unfortunately we won't be taking this request forward.</p>${message ? `<p>${escapeHtml(message)}</p>` : ''}`
        });
    } catch (e) {
        console.log(JSON.stringify({ event: 'new_jc_reject_notify_failed', jcid, error: e.message }));
        params.notifyFailed = '1';
    }
    return redirectTo(STATUS_PAGE, params);
}

async function doIgnore(jcid, file) {
    const ignoredBody = file.body.replace(/^---\s*\n/, '---\n\nignored: true\n');
    try {
        await putFile(`${IGNORED_DIR}/${jcid}.md`, ignoredBody, null, `Ignore ${jcid}.md`, 'pending');
        await deleteFile(`${file.dir}/${jcid}.md`, file.sha, `Ignore ${jcid}.md (remove from pending)`, 'pending');
    } catch (e) {
        console.log(JSON.stringify({ event: 'new_jc_ignore_failed', jcid, error: e.message }));
        return redirectTo(STATUS_PAGE, { status: 'ignore-failed', jcid, title: file.frontmatter.title, reason: e.message });
    }
    console.log(JSON.stringify({ event: 'new_jc_ignored', jcid }));
    await cleanupConfirmResult(jcid, 'new_jc_ignore_confirm_result_cleanup_failed');

    const params = { status: 'ignored', jcid, title: file.frontmatter.title };
    try {
        await sendEmail({
            apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN, from: process.env.FROM_EMAIL_ADDRESS,
            to: process.env.EMAIL_REPORT_TO,
            subject: `ReproducibiliTea JC request ignored: ${file.frontmatter.title}`,
            html: `<p><strong>${escapeHtml(file.frontmatter.title)}</strong> (${jcid}) was marked ignored by an admin. No email was sent to the requester.</p>`
        });
    } catch (e) {
        console.log(JSON.stringify({ event: 'new_jc_ignore_notify_failed', jcid, error: e.message }));
        params.notifyFailed = '1';
    }
    return redirectTo(STATUS_PAGE, params);
}

module.exports.resolveState = resolveState;

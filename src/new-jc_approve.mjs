import 'dotenv/config';
import tokens from './lib/tokens.js';
import mailer from './lib/mailer.js';
import htmlEscape from './lib/html-escape.js';
import envDiagnostics from './lib/env-diagnostics.js';
import githubRepos from './lib/github-repos.js';
import jcIntegrations from './lib/jc-integrations.js';
import reviewState from './lib/jc-review-state.js';

const { verifyToken } = tokens;
const { sendEmail } = mailer;
const { escapeHtml } = htmlEscape;
const { logMisconfigured } = envDiagnostics;
const { repoConfig } = githubRepos;
const { callSlack, callZotero, formatResponses, deleteConfirmResult } = jcIntegrations;
const { resolveState, IGNORED_DIR, ACTIVE_DIR } = reviewState;

const REVIEW_PAGE = 'https://reproducibiliTea.org/jc-review.html';
const STATUS_PAGE = 'https://reproducibiliTea.org/jc-review-status.html';

// Every outcome sends the admin to a styled static page instead of a bare
// HTML fragment rendered by the function itself.
function redirectTo(page, params = {}) {
    const query = new URLSearchParams(params);
    return new Response(null, { status: 302, headers: { Location: `${page}?${query.toString()}` } });
}

export default async (req) => {
    const url = new URL(req.url);
    if (!process.env.EDIT_TOKEN_SECRET) {
        logMisconfigured('new_jc_approve_misconfigured');
        return redirectTo(STATUS_PAGE, { status: 'server-error' });
    }

    const token = url.searchParams.get('token');
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

    if (req.method === 'GET') {
        if (state.state === 'pending') {
            return redirectTo(REVIEW_PAGE, { token, jcid, title: state.file.frontmatter.title || jcid });
        }
        return redirectTo(STATUS_PAGE, { status: state.state, jcid, title: state.title || jcid });
    }
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, POST' } });
    }

    // A revisited/double-submitted link: the token is still valid but the
    // request has already been actioned. Report the real outcome rather than
    // re-running (or erroring on) an action that's already happened.
    if (state.state !== 'pending') {
        return redirectTo(STATUS_PAGE, { status: state.state, jcid, title: state.title || jcid });
    }

    const form = new URLSearchParams(await req.text());
    const message = (form.get('message') || '').trim();
    switch (form.get('action')) {
        case 'approve': return doApprove(jcid, state.file, message);
        case 'reject': return doReject(jcid, state.file, message);
        case 'ignore': return doIgnore(jcid, state.file);
        default: return redirectTo(STATUS_PAGE, { status: 'unknown-action', jcid });
    }
};

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

export const config = {
    path: '/api/v1/new-jc_approve',
    rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip'] }
};

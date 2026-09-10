require('dotenv').config();
const fetch = require('node-fetch');
const { checkData } = require('./lib/jc-validation');
const { callGitHub, notifyAdmins, fetchDraft, deleteDraft, saveConfirmResult, fetchConfirmResult } = require('./lib/jc-integrations');
const { verifyToken, signToken } = require('./lib/tokens');
const { logMisconfigured } = require('./lib/env-diagnostics');
const { sendEmail } = require('./lib/mailer');
const { escapeHtml } = require('./lib/html-escape');
const { repoConfig } = require('./lib/github-repos');

const APPROVE_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days — a review with a written message takes longer than a click
const STATUS_PAGE = 'https://reproducibiliTea.org/jc-request-status.html';

// This whole handler only ever runs from a browser following an emailed link,
// so every outcome sends the visitor to a real site page instead of rendering
// a bare HTML fragment directly.
function redirect(status, params = {}) {
    const query = new URLSearchParams({ status, ...params });
    return { statusCode: 302, headers: { Location: `${STATUS_PAGE}?${query.toString()}` } };
}

exports.handler = async (event) => {
    if (!process.env.EDIT_TOKEN_SECRET) {
        logMisconfigured('new_jc_confirm_misconfigured');
        return redirect('server-error');
    }

    const token = event.queryStringParameters?.token;
    if (!token) return redirect('missing-token');

    const result = verifyToken(token, process.env.EDIT_TOKEN_SECRET);
    if (!result.valid || result.payload.purpose !== 'creation-confirm') {
        return redirect('invalid-token', { reason: result.reason || 'wrong purpose' });
    }

    // Only jc-confirm.html's button POSTs here — a scanner following the emailed
    // link only ever reaches that static page, which has no side effects of its own.
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed', headers: { Allow: 'POST' } };
    }

    // This link is clicked from an email, so there is no usable referer — the
    // sandbox flag rides along in the signed token instead.
    const sandbox = Boolean(result.payload.sandbox);
    if (sandbox) {
        process.env.GITHUB_REPO_API = process.env.GITHUB_REPO_API_SANDBOX;
        process.env.GITHUB_REPO_API_PENDING = process.env.GITHUB_REPO_API_PENDING_SANDBOX;
    }

    const { jcid, draftId } = result.payload;
    const draft = await fetchDraft(draftId);
    if (!draft) {
        console.log(JSON.stringify({ event: 'new_jc_confirm_draft_missing', jcid, draftId }));
        return redirectAlreadyConfirmed(jcid);
    }
    const data = draft.data;

    const check = checkData(data);
    if (check !== null) {
        return redirect('invalid', { jcid: data.jcid, reason: check });
    }

    // Reject a jcid that is already live before anything with side effects runs,
    // and before a pending file is written.
    if (await liveJcExists(data.jcid)) {
        console.log(JSON.stringify({ event: 'new_jc_confirm_jcid_collision', jcid: data.jcid }));
        return redirect('jcid-taken', { jcid: data.jcid });
    }

    // Only the pending-repo commit happens here. Slack/Zotero/the public
    // journal-clubs entry are all admin-approval side effects now (see
    // doApprove in new-jc_approve.js) — nothing here is public or reversible.
    const results = {};
    results.github = await callGitHub(data, results, { dir: '_pending-journal-clubs', target: 'pending' });

    // No pending file means no review link to send: bail out rather than emailing
    // admins a link that 404s. Leaves the draft in place so a retry click (or the
    // requester re-following the same link) can pick up where this left off.
    if (results.github.status !== 'Okay') {
        console.log(JSON.stringify({ event: 'new_jc_confirm_github_failed', jcid: data.jcid, githubStatus: results.github.status }));
        return redirect('github-failed', { jcid: data.jcid });
    }

    // The draft is redundant now the pending file exists; not fatal if this fails
    // (the rollcall cron prunes stale drafts after an hour regardless).
    try {
        await deleteDraft(draftId, draft.sha);
    } catch (e) {
        console.log(JSON.stringify({ event: 'new_jc_confirm_draft_cleanup_failed', draftId, error: e.message }));
    }

    await notifyContacts(data);

    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
    const approveToken = signToken({ purpose: 'admin-approve', jcid: data.jcid, sandbox }, process.env.EDIT_TOKEN_SECRET, { expiresInMs: APPROVE_TOKEN_TTL_MS });
    results.adminNotification = await notifyAdmins({
        data,
        results,
        approveToken,
        adminEmails,
        mailgunConfig: { apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN, fromEmail: process.env.FROM_EMAIL_ADDRESS }
    });

    console.log(JSON.stringify({
        event: 'new_jc_confirmed',
        jcid: data.jcid,
        githubStatus: results.github.status,
        adminNotified: results.adminNotification.status === 'Okay',
        ...(results.adminNotification.status !== 'Okay' ? { adminNotifyError: results.adminNotification.details.join('; ') } : {})
    }));

    // Record the outcome now so a repeat visit to this link (draft already
    // deleted below the fold) replays the same response — see
    // redirectAlreadyConfirmed — instead of a bare "ok" that hides a failed
    // admin notification. Best-effort: failure here doesn't change the
    // response, only whether a retry gets to see it too.
    const okParams = { jcid: data.jcid };
    if (results.adminNotification.status !== 'Okay') {
        okParams.adminNotifyFailed = '1';
        okParams.reportEmail = adminEmails.join(', ');
    }
    try {
        await saveConfirmResult(data.jcid, okParams);
    } catch (e) {
        console.log(JSON.stringify({ event: 'new_jc_confirm_result_save_failed', jcid: data.jcid, error: e.message }));
    }

    return redirect('ok', okParams);
};

/**
 * Let-them-know email to any additional contacts listed on the submission:
 * their address becomes public once an admin approves, with a way to opt out
 * before that happens. Best-effort — failure here doesn't block confirmation,
 * the pending file already exists.
 * @param data {object} cleaned JC data
 */
async function notifyContacts(data) {
    if (!data.emails || !data.emails.length) return;
    try {
        await sendEmail({
            apiKey: process.env.MAILGUN_API_KEY,
            domain: process.env.MAILGUN_DOMAIN,
            from: process.env.FROM_EMAIL_ADDRESS,
            to: data.emails.join(', '),
            subject: `You've been listed as a contact for a ReproducibiliTea journal club: ${data.name}`,
            html: `
<p>${escapeHtml(data.lead)} has listed you as an organiser/contact for the ReproducibiliTea journal club "<strong>${escapeHtml(data.name)}</strong>".</p>
<p>Your email address will become publicly visible on our website once this journal club is approved by our steering committee. If you'd rather it wasn't, please email <a href="mailto:${escapeHtml(process.env.EMAIL_REPORT_TO || '')}">${escapeHtml(process.env.EMAIL_REPORT_TO || '')}</a> before then.</p>
            `
        });
    } catch (e) {
        console.log(JSON.stringify({ event: 'new_jc_confirm_contact_notify_failed', jcid: data.jcid, error: e.message }));
    }
}

// Reached when the draft is already gone — a previous confirm click (or a
// scanner prefetch that has since been superseded by a real click) already
// consumed it. Report the real outcome instead of a generic "already used"
// so a repeat visit (or a delayed click after a scanner ran first) still
// tells the requester where their submission stands.
async function redirectAlreadyConfirmed(jcid) {
    const saved = await fetchConfirmResult(jcid).catch(() => null);
    if (saved) return redirect('ok', saved);
    if (await liveJcExists(jcid)) {
        return redirect('already-live', { jcid });
    }
    if (await pendingJcExists(jcid)) {
        return redirect('ok', { jcid });
    }
    return redirect('already-used', { jcid });
}

/** @return {Promise<boolean>} whether `_journal-clubs/<jcid>.md` already exists */
async function liveJcExists(jcid) {
    const { GITHUB_TOKEN, GITHUB_API_USER, GITHUB_REPO_API } = process.env;
    const res = await fetch(`${GITHUB_REPO_API}/contents/_journal-clubs`, {
        headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}` }
    });
    if (!res.ok) return false; // let callGitHub report the repository problem
    const listing = await res.json();
    return Array.isArray(listing) && listing.some(jc => jc.name === `${jcid}.md`);
}

/** @return {Promise<boolean>} whether `_pending-journal-clubs/<jcid>.md` is still awaiting review */
async function pendingJcExists(jcid) {
    const { token: GITHUB_TOKEN, repoApi: GITHUB_REPO_API, userAgent: GITHUB_API_USER } = repoConfig('pending');
    const res = await fetch(`${GITHUB_REPO_API}/contents/_pending-journal-clubs/${jcid}.md`, {
        headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}` }
    });
    return res.ok;
}

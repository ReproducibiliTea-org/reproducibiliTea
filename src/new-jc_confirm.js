require('dotenv').config();
const fetch = require('node-fetch');
const { checkData } = require('./lib/jc-validation');
const { callSlack, callZotero, callGitHub, notifyAdmins, formatResponses } = require('./lib/jc-integrations');
const { verifyToken, signToken } = require('./lib/tokens');

const APPROVE_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days — a review with a written message takes longer than a click
const HTML_HEADERS = { 'Content-Type': 'text/html' };

exports.handler = async (event) => {
    if (!process.env.EDIT_TOKEN_SECRET) {
        console.log(JSON.stringify({ event: 'new_jc_confirm_misconfigured' }));
        return { statusCode: 500, body: 'Server misconfiguration.' };
    }

    const token = event.queryStringParameters?.token;
    if (!token) {
        return { statusCode: 400, headers: HTML_HEADERS, body: '<p>Missing confirmation token.</p>' };
    }

    const result = verifyToken(token, process.env.EDIT_TOKEN_SECRET);
    if (!result.valid || result.payload.purpose !== 'creation-confirm') {
        return { statusCode: 401, headers: HTML_HEADERS, body: `<p>Confirmation link invalid or expired (${result.reason || 'wrong purpose'}).</p>` };
    }

    // This link is clicked from an email, so there is no usable referer — the
    // sandbox flag rides along in the signed token instead.
    const sandbox = Boolean(result.payload.sandbox);
    if (sandbox) {
        process.env.GITHUB_REPO_API = process.env.GITHUB_REPO_API_SANDBOX;
    }

    const data = result.payload.data;
    const check = checkData(data);
    if (check !== null) {
        return { statusCode: 400, headers: HTML_HEADERS, body: `<p>${check}</p>` };
    }

    // Reject a jcid that is already live before anything with side effects runs
    // (callZotero creates a collection), and before a pending file is written.
    if (await liveJcExists(data.jcid)) {
        console.log(JSON.stringify({ event: 'new_jc_confirm_jcid_collision', jcid: data.jcid }));
        return {
            statusCode: 400,
            headers: HTML_HEADERS,
            body: `<p>The journal club id "${data.jcid}" is already in use by a live ReproducibiliTea journal club. Please resubmit the form with a different id.</p>`
        };
    }

    const [slack, zotero] = await Promise.all([callSlack(data), callZotero(data)]);
    const results = { slack, zotero };
    results.github = await callGitHub(data, results, { dir: '_pending-journal-clubs' });

    // No pending file means no review link to send: bail out rather than emailing
    // admins a link that 404s. Also covers a confirm link being clicked twice.
    if (results.github.status !== 'Okay') {
        console.log(JSON.stringify({ event: 'new_jc_confirm_github_failed', jcid: data.jcid, githubStatus: results.github.status }));
        return {
            statusCode: 500,
            headers: HTML_HEADERS,
            body: `<p>Something went wrong creating your journal club, and it has not been submitted for approval. If you have already used this confirmation link, your request is already awaiting review.</p>${formatResponses(results)}`
        };
    }

    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
    const approveToken = signToken({ purpose: 'admin-approve', jcid: data.jcid, sandbox }, process.env.EDIT_TOKEN_SECRET, { expiresInMs: APPROVE_TOKEN_TTL_MS });
    results.adminNotification = await notifyAdmins({
        data,
        results,
        approveToken,
        adminEmails,
        mailgunConfig: { apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN, fromEmail: process.env.FROM_EMAIL_ADDRESS }
    });

    console.log(JSON.stringify({ event: 'new_jc_confirmed', jcid: data.jcid, githubStatus: results.github.status }));
    return { statusCode: 200, headers: HTML_HEADERS, body: `<p>Thanks! Your journal club has been submitted for approval.</p>${formatResponses(results)}` };
};

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

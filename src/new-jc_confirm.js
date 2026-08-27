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

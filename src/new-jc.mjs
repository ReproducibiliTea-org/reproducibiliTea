import 'dotenv/config';
import crypto from 'node:crypto';
import jcValidation from './lib/jc-validation.js';
import jcIntegrations from './lib/jc-integrations.js';
import tokens from './lib/tokens.js';
import mailer from './lib/mailer.js';
import envDiagnostics from './lib/env-diagnostics.js';

const { cleanData, checkData, checkCreationLimits } = jcValidation;
const { callGitHub, formatResponses, saveDraft } = jcIntegrations;
const { signToken, verifyToken } = tokens;
const { sendEmail } = mailer;
const { logMisconfigured } = envDiagnostics;

const CONFIRM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export default async (req) => {
    console.log(JSON.stringify({ event: 'new_jc_request_received' }));
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
    }

    if (!process.env.EDIT_TOKEN_SECRET) {
        logMisconfigured('new_jc_misconfigured');
        return new Response('Server misconfiguration.', { status: 500 });
    }

    let data;
    try {
        data = cleanData(JSON.parse(await req.text()));
    } catch (e) {
        return new Response('<p>Could not clean submission for processing</p>', { status: 400 });
    }

    // Sandbox detection: this handler is hit by a same-origin AJAX POST, so the
    // referer reliably reflects the site the form was loaded from.
    const sandbox = /(sandbox|localhost)/.test(req.headers.get('referer') || '');
    if (sandbox) {
        process.env.GITHUB_REPO_API = process.env.GITHUB_REPO_API_SANDBOX;
        process.env.GITHUB_REPO_API_PENDING = process.env.GITHUB_REPO_API_PENDING_SANDBOX;
    }

    const rawEditToken = data.editToken;
    if (rawEditToken) {
        return handleEdit(data, rawEditToken);
    }
    return handleCreationRequest(data, sandbox);
};

async function handleEdit(data, rawEditToken) {
    let parsedToken;
    try {
        parsedToken = JSON.parse(rawEditToken).token;
    } catch (e) {
        return new Response(formatResponses({ checkToken: { title: 'Check edit token', status: 'Error', details: ['Malformed edit token.'] } }), { status: 400 });
    }

    const result = verifyToken(parsedToken, process.env.EDIT_TOKEN_SECRET);
    if (!result.valid) {
        return new Response(
            formatResponses({ checkToken: { title: 'Check edit token', status: 'Error', details: [`Token invalid: ${result.reason}`] } }),
            { status: 401 }
        );
    }

    data.jcid = result.payload.jcid;
    const check = checkData(data);
    if (check !== null) {
        return new Response(formatResponses({ check: { title: 'Data check', status: 'Error', details: [check] } }), { status: 400 });
    }

    const github = await callGitHub(data, null, { editToken: result.payload });
    console.log(JSON.stringify({ event: 'new_jc_edit_committed', jcid: data.jcid, status: github.status }));
    return new Response(formatResponses({ github }), { status: 200 });
}

async function handleCreationRequest(data, sandbox) {
    const check = checkData(data) ?? checkCreationLimits(data);
    if (check !== null) {
        return new Response(formatResponses({ check: { title: 'Data check', status: 'Error', details: [check] } }), { status: 400 });
    }

    // The full submission is committed as a draft rather than embedded in the
    // confirm-link URL — descriptions/notes can run to 10000 characters, far
    // past what's safe to put in a mail-client link. The token just carries a
    // pointer to it.
    const draftId = crypto.randomBytes(16).toString('hex');
    try {
        await saveDraft(data, draftId);
    } catch (e) {
        console.log(JSON.stringify({ event: 'new_jc_request_draft_failed', jcid: data.jcid, error: e.message }));
        return new Response(formatResponses({ draft: { title: 'Draft creation', status: 'Error', details: [e.message] } }), { status: 500 });
    }

    const token = signToken({ purpose: 'creation-confirm', jcid: data.jcid, draftId, sandbox }, process.env.EDIT_TOKEN_SECRET, { expiresInMs: CONFIRM_TOKEN_TTL_MS });
    const confirmUrl = `https://reproducibiliTea.org/jc-confirm.html?token=${token}`;

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
        return new Response(formatResponses({ email: { title: 'Confirmation email', status: 'Error', details: [e.message] } }), { status: 500 });
    }

    console.log(JSON.stringify({ event: 'new_jc_request_sent', jcid: data.jcid, email: data.email }));
    return new Response(
        formatResponses({ request: { title: 'Confirmation sent', status: 'Okay', details: [`Check ${data.email} for a confirmation link.`, `If you don't see it soon, please check your spam folder.`] } }),
        { status: 200 }
    );
}

export const config = {
    path: '/api/v1/new-jc',
    rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip'] }
};

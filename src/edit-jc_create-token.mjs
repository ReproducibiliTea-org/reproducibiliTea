import 'dotenv/config';
import tokens from './lib/tokens.js';
import envDiagnostics from './lib/env-diagnostics.js';
import mailer from './lib/mailer.js';

const { signToken } = tokens;
const { logMisconfigured } = envDiagnostics;
const { sendEmail } = mailer;

const {
    EDIT_TOKEN_SECRET,
    GITHUB_API_USER,
    MAILGUN_API_KEY,
    MAILGUN_DOMAIN,
    FROM_EMAIL_ADDRESS
} = process.env;

let { GITHUB_REPO_API } = process.env;

const TOKEN_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

export default async (req) => {
    console.log(JSON.stringify({ event: 'create_token_request_received' }));

    if (!EDIT_TOKEN_SECRET) {
        logMisconfigured('create_token_misconfigured');
        return new Response('Server misconfiguration.', { status: 500 });
    }

    let sandbox = false;
    try {
        sandbox = /(sandbox|localhost)/.test(req.headers.get('referer'));
        if (sandbox) {
            const { GITHUB_REPO_API_SANDBOX } = process.env;
            GITHUB_REPO_API = GITHUB_REPO_API_SANDBOX;
        }

        const data = JSON.parse(await req.text());
        if (data.email) data.email = data.email.replace(/\s/sg, '');
        if (!data.email || !data.jcid) {
            console.log(JSON.stringify({ event: 'create_token_invalid_input' }));
            return new Response('Email and JCID must be submitted in JSON format in the request body.', { status: 400 });
        }

        const ghResponse = await fetch(`${GITHUB_REPO_API}/contents/_journal-clubs`, {
            headers: { 'User-Agent': GITHUB_API_USER }
        });
        const jcList = await ghResponse.json();
        const jcNames = jcList.map(jc => jc.name);
        if (!jcNames.includes(`${data.jcid}.md`)) {
            console.log(JSON.stringify({ event: 'create_token_unknown_jc', jcid: data.jcid }));
            return new Response(`Requested journal club ${data.jcid} does not exist.`, { status: 404 });
        }

        const token = signToken(
            { purpose: 'edit', email: data.email, jcid: data.jcid, message: (data.message || '').slice(0, 300) },
            EDIT_TOKEN_SECRET,
            { expiresInMs: TOKEN_TTL_MS }
        );

        if (data.email !== 'rollcall' && !sandbox) {
            await sendEditLink(data.email, data.jcid, token);
        }

        console.log(JSON.stringify({ event: 'create_token_success', jcid: data.jcid }));
        return new Response('Token created successfully.', { status: 200 });
    } catch (e) {
        console.log(JSON.stringify({ event: 'create_token_failed', error: e.message }));
        return new Response(e.message, { status: 500 });
    }
};

/**
 * Email the edit link
 * @param email {string} email to send to
 * @param jcid {string} journal club to edit
 * @param token {string} token to inject into the link
 */
async function sendEditLink(email, jcid, token) {
    await sendEmail({
        apiKey: MAILGUN_API_KEY,
        domain: MAILGUN_DOMAIN,
        from: FROM_EMAIL_ADDRESS,
        to: email,
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
    });
}

export const config = {
    path: '/api/v1/edit-jc_create-token',
    rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip'] }
};

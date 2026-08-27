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

    if (!EDIT_TOKEN_SECRET) {
        console.log(JSON.stringify({ event: 'create_token_misconfigured' }));
        return { statusCode: 500, body: 'Server misconfiguration.' };
    }

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
            console.log(JSON.stringify({ event: 'create_token_invalid_input' }));
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
            { purpose: 'edit', email: data.email, jcid: data.jcid, message: (data.message || '').slice(0, 300) },
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

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

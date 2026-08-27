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

'use strict';

const fetch = require('node-fetch');
const YAML = require('yaml');
const { sendEmail } = require('./mailer');
const { escapeHtml } = require('./html-escape');

/**
 * Format a set of responses from API calls
 * @param re {object} dictionary of response objects
 * @return {string} HTML response body
 */
function formatResponses(re) {
    let out = "";
    for (const s in re) {
        if (!re.hasOwnProperty(s)) continue;
        const r = re[s];
        out += `
<div class="${r.status.toLowerCase()}">
<h2>${r.title} - <span class="${r.status.toLowerCase()}">${r.status}</span></h2>
`;
        out += '<ul>';
        for (const task of r.details) {
            out += `
    <li>${task}</li>`;
        }
        out += '</ul></div>';
    }
    return out;
}

async function callSlack(data) {
    return {
        title: 'Slack',
        status: 'Okay',
        details: [
            `Please join the workspace using the direct link: <a href="${process.env.SLACK_LINK}" target="_blank">${process.env.SLACK_LINK}</a>.
Please share this link with any organisers and members of your journal club who might like to join our discussions, attend networking events, or get notified about related initiatives.`
        ]
    };
}

async function callZotero(data) {
    const { ZOTERO_TOKEN } = process.env;
    const out = { title: 'Zotero', status: 'Okay', details: [], zoteroCollectionId: null };
    const url = 'https://api.zotero.org/groups/2354006';

    try {
        const call = await fetch(`${url}/collections`, { headers: { 'Zotero-API-Version': '3' } });
        if (!call.ok) throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        const response = await call.json();
        if (response.length) {
            for (const r of response) {
                if (r.data.name === data.name) {
                    out.status = 'Warning';
                    out.details.push('A Zotero collection with a similar name already exists; another will not be created.');
                    return out;
                }
            }
        }
    } catch (e) {
        out.status = 'Error';
        out.details.push('An error occurred: ' + e.toString());
        return out;
    }

    const addCollection = JSON.stringify([{ name: data.name, parentCollection: false }]);
    try {
        const call = await fetch(`${url}/collections`, {
            method: 'POST',
            headers: {
                'Zotero-API-Version': '3',
                Authorization: `Bearer ${ZOTERO_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: addCollection
        });
        if (!call.ok) throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        const response = await call.json();
        if (response.success && response.success[0] && response.success[0].length) {
            out.zoteroCollectionId = response.success[0];
            out.details.push(`Created new Zotero collection at <a href="https://www.zotero.org/groups/2354006/reproducibilitea/items/collectionKey/${out.zoteroCollectionId}" target="_blank">https://www.zotero.org/groups/2354006/reproducibilitea/items/collectionKey/${out.zoteroCollectionId}</a>.`);
        } else {
            out.status = 'Error';
            out.details.push('Unable to create Zotero collection.');
            return out;
        }
    } catch (e) {
        out.status = 'Error';
        out.details.push('An error occurred while creating the collection: ' + e.toString());
        return out;
    }

    if (!data.zoteroUser || !data.zoteroUser.length) return out;

    let members = [];
    try {
        const call = await fetch(url, { headers: { 'Zotero-API-Version': '3' } });
        if (!call.ok) throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        const response = await call.json();
        if (!response.data || !response.data.members) {
            out.status = 'Warning';
            out.details.push('Unable to add user as a Zotero group member.');
            return out;
        }
        members = [...response.data.members, data.zoteroUser];
    } catch (e) {
        out.status = 'Error';
        out.details.push('An error occurred while adding the user to the group: ' + e.toString());
        return out;
    }

    try {
        const call = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Zotero-API-Version': '3',
                Authorization: `Bearer ${ZOTERO_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([{ members }])
        });
        if (!call.ok) throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        await call.json();
        out.details.push('Added the user to the Zotero group.');
    } catch (e) {
        out.status = 'Warning';
        out.details.push('An error occurred while adding the user as a group member: ' + e.toString());
        return out;
    }

    return out;
}

/**
 * @param data {object} cleaned JC data
 * @param results {object} prior API call results (used to preserve osf/zotero on an edit commit)
 * @param opts {{editToken?: object|null, dir?: string}}
 */
async function callGitHub(data, results, opts = {}) {
    const { editToken = null, dir = '_journal-clubs' } = opts;
    const { GITHUB_TOKEN, GITHUB_API_USER } = process.env;
    let { GITHUB_REPO_API } = process.env;
    const out = { title: 'GitHub', status: 'Okay', details: [] };
    const url = `${GITHUB_REPO_API}/contents/${dir}`;

    let sha;
    try {
        const call = await fetch(url, { headers: { 'User-Agent': GITHUB_API_USER } });
        if (!call.ok) throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        const response = await call.json();

        for (const jc of response) {
            if (jc.name === `${data.jcid}.md`) {
                if (editToken) {
                    await fetch(`${url}/${encodeURI(jc.name)}`, {
                        headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}` }
                    })
                        .then(r => {
                            if (r.status === 200) return r.json();
                            throw new Error(`Could not lookup existing JC: ${r.statusText} (${r.status})`);
                        })
                        .then(f => {
                            const body = Buffer.from(f.content, 'base64').toString('utf8');
                            const osf = /^osf: "?(.*)"?$/m.exec(body);
                            const zotero = /^zotero: "?(.*)"?$/m.exec(body);
                            results = { osf: { osfRepoId: osf ? osf[1] : null }, zotero: { zoteroCollectionId: zotero ? zotero[1] : null } };
                            sha = f.sha;
                        });
                    break;
                }
                out.status = 'Warning';
                out.details.push(`${data.jcid}.md already exists: a new version will not be created.`);
                return out;
            }
        }
    } catch (e) {
        out.status = 'Warning';
        out.details.push('An error occurred while accessing the repository. ' + e.toString());
        return out;
    }

    const frontmatter = {
        jcid: data.jcid,
        title: data.name,
        'host-organisation': data.uni,
        'host-org-url': data.uniWWW,
        osf: results?.osf?.osfRepoId ?? data.osf ?? '',
        zotero: results?.zotero?.zoteroCollectionId ?? '',
        website: data.www,
        twitter: data.twitter,
        signup: data.signup,
        organisers: [data.lead, ...data.helpers],
        contact: data.email,
        'additional-contact': data.emails,
        address: data.post.split(/[\n,]+/).map(s => s.trim()),
        country: data.country,
        geolocation: data.geolocation,
        'last-message-timestamp': Math.floor(Date.now() / 1000),
        'last-message-level': 0,
        'last-update': editToken ? editToken.email : data.email,
        'last-update-timestamp': Math.floor(Date.now() / 1000),
        'last-update-message': (editToken ? editToken.message : 'API creation').replace(/\n */g, '\n ')
    };

    const yaml = YAML.stringify(frontmatter);
    out.githubFile = `---\n\n${yaml}\n\n---\n\n${data.description}\n`;

    const commitBody = editToken
        ? { message: `Form update of ${data.jcid}.md by ${editToken.email}.\n${editToken.message}`, content: Buffer.from(out.githubFile, 'utf8').toString('base64'), sha }
        : { message: `Creation of ${data.jcid}.md`, content: Buffer.from(out.githubFile, 'utf8').toString('base64') };

    try {
        const call = await fetch(`${url}/${data.jcid}.md`, {
            method: 'PUT',
            headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(commitBody)
        });
        if (!call.ok) throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        await call.json();

        const verb = editToken ? 'Updated' : 'Created';
        out.details.push(`${verb} ${data.jcid}.md. See <a href="https://reproducibiliTea.org/journal-clubs/#${encodeURI(data.name)}" target="_blank">https://reproducibiliTea.org/journal-clubs/#${encodeURI(data.name)}</a> once it goes live.`);
    } catch (e) {
        out.status = 'Warning';
        out.details.push('An error occurred while creating JC.md file: ' + e.toString());
        return out;
    }

    return out;
}

/**
 * Notify every admin address with a creation report and an approve-link token.
 * @param {{data: object, results: object, approveToken: string, adminEmails: string[], mailgunConfig: {apiKey, domain, fromEmail}}} args
 */
async function notifyAdmins({ data, results, approveToken, adminEmails, mailgunConfig }) {
    const out = { title: 'Admin notification', status: 'Okay', details: [] };
    const reviewUrl = `https://reproducibiliTea.org/.netlify/functions/new-jc_approve?token=${approveToken}`;
    const noteSection = data.adminNote
        ? `<h2>Note from the organisers</h2><p>${escapeHtml(data.adminNote)}</p>`
        : '';

    try {
        await sendEmail({
            apiKey: mailgunConfig.apiKey,
            domain: mailgunConfig.domain,
            from: mailgunConfig.fromEmail,
            to: adminEmails.join(', '),
            subject: `New ReproducibiliTea pending review: ${data.name}`,
            html: `
<p>A new ReproducibiliTea journal club is awaiting review: <strong>${escapeHtml(data.name)}</strong>.</p>
<p><a href="${reviewUrl}">Review ${escapeHtml(data.name)}</a> (link expires in 14 days)</p>
${noteSection}
<h1>Creation report</h1>
${formatResponses(results)}
<h2>Generated JC.md file</h2>
<pre>${escapeHtml(results.github?.githubFile || '')}</pre>
            `
        });
        out.details.push(`Sent review request to ${adminEmails.join(', ')}.`);
    } catch (e) {
        out.status = 'Error';
        out.details.push('Failed to notify admins: ' + e.toString());
    }

    return out;
}

const UNCONFIRMED_DRAFT_DIR = '_pending-journal-clubs/unconfirmed';

/**
 * Commit an unconfirmed creation request so its content doesn't have to travel
 * through the confirmation-email URL. Deleted once confirmed (see deleteDraft),
 * or pruned by the rollcall cron if never confirmed.
 * @param data {object} cleaned JC data
 * @param draftId {string} random id naming this draft
 */
async function saveDraft(data, draftId) {
    const { GITHUB_TOKEN, GITHUB_API_USER, GITHUB_REPO_API } = process.env;
    const res = await fetch(`${GITHUB_REPO_API}/contents/${UNCONFIRMED_DRAFT_DIR}/${draftId}.json`, {
        method: 'PUT',
        headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: `Draft creation request ${draftId}`,
            content: Buffer.from(JSON.stringify(data), 'utf8').toString('base64')
        })
    });
    if (!res.ok) throw new Error(`Server response: ${res.status}: ${res.statusText}`);
}

/**
 * @param draftId {string}
 * @return {Promise<{data: object, sha: string}|null>} null if the draft doesn't exist (already confirmed, pruned, or a forged id)
 */
async function fetchDraft(draftId) {
    const { GITHUB_TOKEN, GITHUB_API_USER, GITHUB_REPO_API } = process.env;
    const res = await fetch(`${GITHUB_REPO_API}/contents/${UNCONFIRMED_DRAFT_DIR}/${draftId}.json`, {
        headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}` }
    });
    if (!res.ok) return null;
    const file = await res.json();
    return { data: JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')), sha: file.sha };
}

/**
 * @param draftId {string}
 * @param sha {string} the draft file's current sha, from fetchDraft
 */
async function deleteDraft(draftId, sha) {
    const { GITHUB_TOKEN, GITHUB_API_USER, GITHUB_REPO_API } = process.env;
    const res = await fetch(`${GITHUB_REPO_API}/contents/${UNCONFIRMED_DRAFT_DIR}/${draftId}.json`, {
        method: 'DELETE',
        headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Remove confirmed draft ${draftId}`, sha })
    });
    if (!res.ok) throw new Error(`Server response: ${res.status}: ${res.statusText}`);
}

module.exports = { callSlack, callZotero, callGitHub, notifyAdmins, formatResponses, saveDraft, fetchDraft, deleteDraft };

const fetch = require('node-fetch');
const YAML = require('yaml');
const { repoConfig } = require('./github-repos');

const PENDING_DIR = '_pending-journal-clubs';
const IGNORED_DIR = `${PENDING_DIR}/ignored`;
const ACTIVE_DIR = '_journal-clubs';

/**
 * Where a jcid's review request currently stands: still awaiting review, or
 * one of the three outcomes an admin action (or a previous visit to this
 * same link) has already produced.
 * @return {Promise<{state: 'pending', file: object}|{state: 'ignored', title: string, file: object}|{state: 'approved', title: string}|{state: 'rejected'}>}
 */
async function resolveState(jcid) {
    const file = await fetchPending(jcid);
    if (file && file.dir === PENDING_DIR) return { state: 'pending', file };
    if (file && file.dir === IGNORED_DIR) return { state: 'ignored', title: file.frontmatter.title, file };

    // Not pending or ignored: it was either approved (now live) or rejected
    // (deleted outright, no trace left behind) — the only two remaining
    // outcomes doApprove/doReject/doIgnore can produce.
    const live = await fetchLive(jcid);
    return live.exists ? { state: 'approved', title: live.title } : { state: 'rejected' };
}

async function fetchPending(jcid) {
    const { token: GITHUB_TOKEN, repoApi: GITHUB_REPO_API, userAgent: GITHUB_API_USER } = repoConfig('pending');
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

/** @return {Promise<{exists: boolean, title?: string}>} whether `_journal-clubs/<jcid>.md` is live, and its title if so */
async function fetchLive(jcid) {
    const { token: GITHUB_TOKEN, repoApi: GITHUB_REPO_API, userAgent: GITHUB_API_USER } = repoConfig('public');
    const res = await fetch(`${GITHUB_REPO_API}/contents/${ACTIVE_DIR}/${jcid}.md`, {
        headers: { 'User-Agent': GITHUB_API_USER, Authorization: `token ${GITHUB_TOKEN}` }
    });
    if (res.status === 404) return { exists: false };
    if (!res.ok) throw new Error(`Server response: ${res.status}: ${res.statusText}`);
    const json = await res.json();
    const body = Buffer.from(json.content, 'base64').toString('utf8');
    const fm = /^---\s*\n([\s\S]*?)\n---/.exec(body);
    return { exists: true, title: fm ? YAML.parse(fm[1]).title : jcid };
}

module.exports = { resolveState, PENDING_DIR, IGNORED_DIR, ACTIVE_DIR };

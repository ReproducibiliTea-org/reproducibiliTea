'use strict';

// Netlify scopes env vars per deploy context (production/branch/preview) and
// per build step (Builds/Functions/Runtime/Post-processing). A var can exist
// in the UI but still be absent from `process.env` at function runtime if
// it's scoped wrong. Logging booleans (never values) lets us tell "var truly
// unset" apart from "only this context/scope is missing it" without leaking
// secrets to logs.
const ENV_KEYS = [
    'EDIT_TOKEN_SECRET', 'MAILGUN_API_KEY', 'MAILGUN_DOMAIN', 'FROM_EMAIL_ADDRESS',
    'ADMIN_EMAILS', 'EMAIL_REPORT_TO', 'SLACK_LINK', 'GITHUB_TOKEN', 'GITHUB_API_USER',
    'GITHUB_REPO_API', 'GITHUB_REPO_API_SANDBOX', 'GITHUB_TOKEN_PENDING',
    'GITHUB_REPO_API_PENDING', 'GITHUB_REPO_API_PENDING_SANDBOX', 'ZOTERO_TOKEN',
];

function logMisconfigured(event) {
    const envPresent = Object.fromEntries(ENV_KEYS.map((k) => [k, Boolean(process.env[k])]));
    console.log(JSON.stringify({ event, context: process.env.CONTEXT, envPresent }));
}

module.exports = { logMisconfigured };

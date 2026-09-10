'use strict';

/**
 * Which GitHub repo/token a Contents API call should hit: the public
 * reproducibiliTea repo (_journal-clubs) or the private pending-journal-clubs
 * repo (drafts, pending submissions, ignored). Read fresh from process.env on
 * every call so the sandbox override (mutating process.env per-request) keeps
 * working for both.
 * @param {'public'|'pending'} [target]
 */
function repoConfig(target = 'public') {
    const { GITHUB_TOKEN, GITHUB_TOKEN_PENDING, GITHUB_API_USER, GITHUB_REPO_API, GITHUB_REPO_API_PENDING } = process.env;
    return target === 'pending'
        ? { token: GITHUB_TOKEN_PENDING, repoApi: GITHUB_REPO_API_PENDING, userAgent: GITHUB_API_USER }
        : { token: GITHUB_TOKEN, repoApi: GITHUB_REPO_API, userAgent: GITHUB_API_USER };
}

module.exports = { repoConfig };

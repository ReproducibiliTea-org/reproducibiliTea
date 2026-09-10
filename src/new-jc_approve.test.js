// ponytail self-check: exercises resolveState's three-outcome branch
// (pending/ignored/approved/rejected) plus the fetchLive 404-vs-error split,
// with node-fetch stubbed so no network/GitHub token is needed.
const { test } = require('node:test');
const assert = require('node:assert');
const Module = require('module');

process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN_PENDING = 'x';
process.env.GITHUB_API_USER = 'x';
process.env.GITHUB_REPO_API = 'https://api.github.com/repos/org/public';
process.env.GITHUB_REPO_API_PENDING = 'https://api.github.com/repos/org/pending';

let nextResponses = [];
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
    if (request === 'node-fetch') return (url) => Promise.resolve(nextResponses.shift() ?? { ok: false, status: 404 });
    return originalLoad.call(this, request, ...rest);
};
const { resolveState } = require('./new-jc_approve.js');
Module._load = originalLoad;

function contentsResponse(frontmatter) {
    const body = `---\n${frontmatter}\n---\nbody`;
    return { ok: true, status: 200, json: async () => ({ sha: 's1', content: Buffer.from(body).toString('base64') }) };
}

test('resolveState: pending file found in pending dir', async () => {
    nextResponses = [contentsResponse('title: Foo')];
    const state = await resolveState('foo');
    assert.strictEqual(state.state, 'pending');
});

test('resolveState: not in pending, found in ignored dir', async () => {
    nextResponses = [{ ok: false, status: 404 }, contentsResponse('title: Foo')];
    const state = await resolveState('foo');
    assert.strictEqual(state.state, 'ignored');
    assert.strictEqual(state.title, 'Foo');
});

test('resolveState: not pending/ignored, live in public repo => approved', async () => {
    nextResponses = [{ ok: false, status: 404 }, { ok: false, status: 404 }, contentsResponse('title: Foo')];
    const state = await resolveState('foo');
    assert.strictEqual(state.state, 'approved');
    assert.strictEqual(state.title, 'Foo');
});

test('resolveState: not found anywhere => rejected', async () => {
    nextResponses = [{ ok: false, status: 404 }, { ok: false, status: 404 }, { ok: false, status: 404 }];
    const state = await resolveState('foo');
    assert.strictEqual(state.state, 'rejected');
});

test('resolveState: transient error on the public-repo check does not read as rejected', async () => {
    nextResponses = [{ ok: false, status: 404 }, { ok: false, status: 404 }, { ok: false, status: 500, statusText: 'Server Error' }];
    await assert.rejects(() => resolveState('foo'));
});

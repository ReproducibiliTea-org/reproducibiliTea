'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('./rollcall');

function jsonResponse(body, headers = {}) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    headers: { get: (name) => headers[name.toLowerCase()] || null }
  };
}

function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
}

const JC_MD = `---
jcid: testjc
title: Test JC
contact: organiser@example.com
last-message-timestamp: 0
last-message-level: 0
last-update-timestamp: 0
---
body
`;

test('run() logs a dry-run action without sending email or committing', async (t) => {
  const calls = [];
  const originalFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });

    if (String(url).endsWith('/contents/_journal-clubs')) {
      return jsonResponse([{ name: 'testjc.md', path: '_journal-clubs/testjc.md', url: 'https://api.github.com/x/testjc.md' }]);
    }
    if (String(url) === 'https://api.github.com/x/testjc.md') {
      return jsonResponse(
        { name: 'testjc.md', path: '_journal-clubs/testjc.md', sha: 'abc', content: b64(JC_MD), url: 'https://api.github.com/x/testjc.md' },
        { 'last-modified': 'Wed, 01 Jan 2020 00:00:00 GMT' }
      );
    }
    if (String(url).includes('/contents/_emails/rollcall-message-1.json')) {
      return jsonResponse({ content: b64(JSON.stringify({ subject: 'Hi {{ jcTitle }}', body: 'Body {{ jcTitle }}' })) });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  t.after(() => { global.fetch = originalFetch; });

  await run({
    repoApi: 'https://api.github.com/x',
    token: 'fake-token',
    targetJcid: 'testjc',
    dryRun: true,
    mailgunConfig: { apiKey: 'x', domain: 'x', fromEmail: 'from@example.com' }
  });

  const methods = calls.map(c => c.method);
  assert.ok(!methods.includes('PUT'), 'dry run must not PUT any commit');
  assert.ok(!methods.includes('DELETE'), 'dry run must not DELETE any file');
});

test('run() does nothing when no journal club is viable', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith('/contents/_journal-clubs')) {
      return jsonResponse([{ name: 'testjc.md', path: '_journal-clubs/testjc.md', url: 'https://api.github.com/x/testjc.md' }]);
    }
    if (String(url) === 'https://api.github.com/x/testjc.md') {
      const freshJc = JC_MD.replace('last-update-timestamp: 0', `last-update-timestamp: ${Math.floor(Date.now() / 1000)}`);
      return jsonResponse(
        { name: 'testjc.md', path: '_journal-clubs/testjc.md', sha: 'abc', content: b64(freshJc), url: 'https://api.github.com/x/testjc.md' },
        { 'last-modified': new Date().toUTCString() }
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  t.after(() => { global.fetch = originalFetch; });

  // Should complete without throwing and without requesting an email template.
  await run({
    repoApi: 'https://api.github.com/x',
    token: 'fake-token',
    targetJcid: null,
    dryRun: true,
    mailgunConfig: { apiKey: 'x', domain: 'x', fromEmail: 'from@example.com' }
  });
});

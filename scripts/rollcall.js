'use strict';

const {
  MESSAGE_LEVELS,
  ACTIONS,
  parseJournalClub,
  pickJournalClub,
  newMessageLevel,
  substituteHandlebars
} = require('./rollcall-lib');

const USER_AGENT = 'reproducibiliTea-rollcall';

function log(event, fields = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}

async function githubRequest(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      Authorization: `token ${token}`,
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    throw new Error(`GitHub request failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res;
}

async function fetchJournalClubs(repoApi, token) {
  const listRes = await githubRequest(`${repoApi}/contents/_journal-clubs`, token);
  const list = await listRes.json();

  const jcs = [];
  for (const entry of list) {
    const fileRes = await githubRequest(entry.url, token);
    const modified = new Date(fileRes.headers.get('last-modified'));
    const file = await fileRes.json();
    const content = Buffer.from(file.content, 'base64').toString('utf8');
    try {
      const jc = parseJournalClub(content);
      jc.modified = modified;
      jc.githubFile = file;
      jc.rawContent = content;
      jcs.push(jc);
    } catch (e) {
      log('parse_error', { path: entry.path, error: e.message });
    }
  }
  return jcs;
}

async function sendRollcallEmail(jc, level, repoApi, token, mailgunConfig, dryRun) {
  const templateRes = await githubRequest(`${repoApi}/contents/_emails/rollcall-message-${level}.json`, token);
  const templateFile = await templateRes.json();
  const template = JSON.parse(Buffer.from(templateFile.content, 'base64').toString('utf8'));
  const email = substituteHandlebars(template, { jcTitle: jc.title });

  const recipients = [...jc.contactEmails];
  if (level === MESSAGE_LEVELS.JC_DEACTIVATED) {
    recipients.push(mailgunConfig.fromEmail);
  }

  if (dryRun) {
    log('dry_run_email', { jcid: jc.jcid, level, recipients });
    return;
  }

  const Mailgun = require('mailgun.js');
  const mailgun = new Mailgun(FormData);
  const mg = mailgun.client({ username: 'api', key: mailgunConfig.apiKey, url: 'https://api.eu.mailgun.net' });

  const to = recipients.shift();
  const data = {
    from: mailgunConfig.fromEmail,
    to,
    'h:Reply-To': mailgunConfig.fromEmail,
    subject: email.subject,
    html: email.body
  };
  if (recipients.length) data.cc = recipients.join(', ');

  await mg.messages.create(mailgunConfig.domain, data);
}

async function updateMessageStatus(jc, level, token, dryRun) {
  const newBody = jc.rawContent
    .replace(/last-message-timestamp: .+$/m, `last-message-timestamp: ${Math.floor(Date.now() / 1000)}`)
    .replace(/last-message-level: .+$/m, `last-message-level: ${level}`);

  if (dryRun) {
    log('dry_run_update', { jcid: jc.jcid, level });
    return;
  }

  await githubRequest(jc.githubFile.url, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Rollcall: Update ${jc.jcid}.md last message time.`,
      content: Buffer.from(newBody, 'utf8').toString('base64'),
      sha: jc.githubFile.sha
    })
  });
}

async function deactivateJC(jc, repoApi, token, dryRun) {
  const newPath = jc.githubFile.path.replace(/^_/, '_inactive-');

  if (dryRun) {
    log('dry_run_deactivate', { jcid: jc.jcid, newPath });
    return;
  }

  await githubRequest(`${repoApi}/contents/${newPath}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Rollcall: Archiving of ${jc.jcid}`,
      content: jc.githubFile.content
    })
  });

  await githubRequest(jc.githubFile.url, token, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Rollcall: Removing ${jc.githubFile.path}`,
      sha: jc.githubFile.sha
    })
  });
}

async function run({ repoApi, token, targetJcid, dryRun, mailgunConfig }) {
  log('rollcall_start', { targetJcid, dryRun });

  const jcs = await fetchJournalClubs(repoApi, token);
  const jc = pickJournalClub(jcs, new Date(), targetJcid);

  if (!jc) {
    log('rollcall_done', { result: 'no_viable_jc' });
    return;
  }

  const level = newMessageLevel(jc);
  log('rollcall_action', { jcid: jc.jcid, level, action: ACTIONS[level] });

  try {
    await sendRollcallEmail(jc, level, repoApi, token, mailgunConfig, dryRun);
  } catch (e) {
    log('rollcall_email_failed', { jcid: jc.jcid, error: e.message });
    process.exitCode = 1;
    return;
  }

  if (level >= MESSAGE_LEVELS.JC_DEACTIVATED) {
    await deactivateJC(jc, repoApi, token, dryRun);
  } else {
    await updateMessageStatus(jc, level, token, dryRun);
  }

  log('rollcall_done', { jcid: jc.jcid, action: ACTIONS[level] });
}

if (require.main === module) {
  const repoApi = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}`;
  const token = process.env.GITHUB_TOKEN;
  const targetJcid = process.env.ROLLCALL_JC || null;
  const dryRun = process.env.ROLLCALL_DRY_RUN === 'true';
  const mailgunConfig = {
    apiKey: process.env.MAILGUN_API_KEY,
    domain: process.env.MAILGUN_DOMAIN,
    fromEmail: process.env.FROM_EMAIL_ADDRESS
  };

  run({ repoApi, token, targetJcid, dryRun, mailgunConfig }).catch(e => {
    log('rollcall_fatal', { error: e.message });
    process.exit(1);
  });
}

module.exports = { run };

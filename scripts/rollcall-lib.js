'use strict';

const YAML = require('yaml');

const MESSAGE_LEVELS = {
  UP_TO_DATE: 0,
  NOTIFICATION: 1,
  FIRST_REMINDER: 2,
  SECOND_REMINDER: 3,
  JC_DEACTIVATED: 4
};

const ACTIONS = {
  1: 'Send notification.',
  2: 'First reminder.',
  3: 'Second reminder.',
  4: 'Deactivate journal club.'
};

const MAX_DAYS_SINCE_UPDATE = 365;
const MIN_DAYS_BETWEEN_EMAILS = 28;
const UNCONFIRMED_DRAFT_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Parse a journal club markdown file's YAML frontmatter into a plain object.
 * @param {string} content - full file content, including the --- delimiters
 */
function parseJournalClub(content) {
  const match = /^---(.*?)---\s*([\s\S]*)$/s.exec(content);
  if (!match) {
    throw new Error('Invalid journal club file - no YAML header found.');
  }
  const yaml = YAML.parse(match[1]) || {};

  const contactEmails = [];
  if (yaml.contact) contactEmails.push(yaml.contact);
  if (Array.isArray(yaml['additional-contact'])) {
    contactEmails.push(...yaml['additional-contact']);
  }

  return {
    jcid: yaml.jcid || null,
    title: yaml.title || null,
    lastUpdate: typeof yaml['last-update-timestamp'] === 'number'
      ? new Date(yaml['last-update-timestamp'] * 1000)
      : new Date(0),
    lastMessage: typeof yaml['last-message-timestamp'] === 'number'
      ? new Date(yaml['last-message-timestamp'] * 1000)
      : new Date(0),
    lastMessageLevel: typeof yaml['last-message-level'] === 'number'
      ? yaml['last-message-level']
      : MESSAGE_LEVELS.UP_TO_DATE,
    contactEmails: contactEmails
      .map(e => (typeof e === 'string' ? e.trim().split(/\s+/)[0] : null))
      .filter(Boolean)
  };
}

function daysAgo(now, days) {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

function isViableForRollcall(jc, now = new Date()) {
  const tooOld = daysAgo(now, MAX_DAYS_SINCE_UPDATE);
  const tooRecent = daysAgo(now, MIN_DAYS_BETWEEN_EMAILS);
  return jc.lastUpdate < tooOld && jc.lastMessage < tooRecent;
}

function pickJournalClub(jcs, now = new Date(), targetJcid = null) {
  const viable = jcs.filter(jc => isViableForRollcall(jc, now));
  if (!viable.length) return null;
  if (targetJcid) {
    const lower = targetJcid.toLowerCase();
    return viable.find(jc => jc.jcid && jc.jcid.toLowerCase() === lower) || null;
  }
  return viable.reduce((oldest, jc) =>
    jc.modified.getTime() < oldest.modified.getTime() ? jc : oldest
  );
}

function newMessageLevel(jc) {
  return jc.lastMessageLevel + 1;
}

/**
 * Whether an unconfirmed creation draft is old enough to prune.
 * @param {Date} lastModified
 * @param {Date} [now]
 */
function isDraftStale(lastModified, now = new Date()) {
  return now.getTime() - lastModified.getTime() > UNCONFIRMED_DRAFT_MAX_AGE_MS;
}

function substituteHandlebars(template, subs) {
  const out = {};
  for (const key of Object.keys(template)) {
    if (typeof template[key] !== 'string') {
      out[key] = template[key];
      continue;
    }
    let value = template[key];
    for (const subKey of Object.keys(subs)) {
      value = value.replace(new RegExp(`{{ *${subKey} *}}`, 'g'), subs[subKey]);
    }
    out[key] = value;
  }
  return out;
}

module.exports = {
  MESSAGE_LEVELS,
  ACTIONS,
  MAX_DAYS_SINCE_UPDATE,
  MIN_DAYS_BETWEEN_EMAILS,
  UNCONFIRMED_DRAFT_MAX_AGE_MS,
  parseJournalClub,
  isViableForRollcall,
  pickJournalClub,
  newMessageLevel,
  isDraftStale,
  substituteHandlebars
};

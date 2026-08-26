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

module.exports = {
  MESSAGE_LEVELS,
  ACTIONS,
  MAX_DAYS_SINCE_UPDATE,
  MIN_DAYS_BETWEEN_EMAILS,
  parseJournalClub
};

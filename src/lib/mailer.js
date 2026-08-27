'use strict';

/**
 * Send an email via Mailgun.
 * @param {{apiKey: string, domain: string, from: string, to: string, cc?: string, replyTo?: string, subject: string, html: string}} opts
 */
async function sendEmail(opts) {
    const Mailgun = require('mailgun.js');
    const mailgun = new Mailgun(FormData);
    const mg = mailgun.client({ username: 'api', key: opts.apiKey, url: 'https://api.eu.mailgun.net' });

    const data = {
        from: opts.from,
        to: opts.to,
        'h:Reply-To': opts.replyTo || opts.from,
        subject: opts.subject,
        html: opts.html
    };
    if (opts.cc) data.cc = opts.cc;
    if (opts.bcc) data.bcc = opts.bcc;

    await mg.messages.create(opts.domain, data);
}

module.exports = { sendEmail };

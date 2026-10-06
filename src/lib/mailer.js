'use strict';

/**
 * Send an email via Mailgun.
 * Reply-To defaults to ADMIN_EMAILS so replies reach a monitored inbox rather than the sending address.
 * @param {{apiKey: string, domain: string, from: string, to: string, cc?: string, bcc?: string, replyTo?: string, subject: string, html: string}} opts
 */
async function sendEmail(opts) {
    const Mailgun = require('mailgun.js');
    const mailgun = new Mailgun(FormData);
    const mg = mailgun.client({ username: 'api', key: opts.apiKey, url: 'https://api.eu.mailgun.net' });

    const replyTo = opts.replyTo || process.env.ADMIN_EMAILS || opts.from;
    const data = {
        from: opts.from,
        to: opts.to,
        'h:Reply-To': replyTo,
        // Transactional mail only; header exists for deliverability, unsubscribe requests reach an admin by hand.
        'h:List-Unsubscribe': `<mailto:${replyTo.split(',')[0].trim()}?subject=unsubscribe>`,
        subject: opts.subject,
        html: opts.html
    };
    if (opts.cc) data.cc = opts.cc;
    if (opts.bcc) data.bcc = opts.bcc;

    await mg.messages.create(opts.domain, data);
}

module.exports = { sendEmail };

/*
* Script to update journal clubs. Designed for use on Amazon Web Services as a
* scheduled function.
*
* The script does the following:
* 1. Query GitHub for active journal clubs
* 2. Select the JC updated least recently
* 3. Check whether the JC owners need to be prompted to update
* 4. Send the appropriate emails if any
* 5. Update the JC to mark the last email sent
*/

// node fetch support
const fetch = require("node-fetch");
require('dotenv').config();
const YAML = require('yaml')

let {GITHUB_REPO_API} = process.env;

const {
    GITHUB_API_USER,
    GITHUB_TOKEN,
    MAILGUN_API_KEY,
    MAILGUN_DOMAIN,
    MAILGUN_HOST,
    FROM_EMAIL_ADDRESS
} = process.env;

const MESSAGE_LEVELS = {
    UP_TO_DATE: 0,
    NOTIFICATION: 1,
    FIRST_REMINDER: 2,
    SECOND_REMINDER: 3,
    JC_DEACTIVATED: 4
};

const ACTIONS = {
    "action-1": "Send notification.",
    "action-2": "First reminder.",
    "action-3": "Second reminder",
    "action-4": "Deactivate journal club."
};

const MAX_DAYS_SINCE_UPDATE = 365;
const MIN_DAYS_BETWEEN_EMAILS = 28;

const TOO_OLD = new Date()
    .setDate(new Date().getDate() - MAX_DAYS_SINCE_UPDATE);
const TOO_RECENT = new Date()
    .setDate(new Date().getDate() - MIN_DAYS_BETWEEN_EMAILS);

let SANDBOX = true;
let JC_TARGET = null;

exports.handler = function(event, context, callback) {
    SANDBOX = /^localhost(?::[0-9]+$|$)/i.test(event.headers.host) || event.queryStringParameters.sandbox;
    JC_TARGET = event.queryStringParameters.jc;
    if(JC_TARGET)
        JC_TARGET = decodeURI(JC_TARGET).toLowerCase();
    if(SANDBOX)
        GITHUB_REPO_API = process.env.GITHUB_REPO_API_SANDBOX;
    if(SANDBOX && !JC_TARGET)
        JC_TARGET = process.env.SANDBOX_JOURNAL_CLUB;
    rollcall(callback);
};

/**
 * @class Rollcall result
 * @classdesc Contains the details of a rollcall result
 *
 * @property journalClub {JournalClub} journal club the result pertains to
 * @property action {string} action taken by the rollcall
 */
class RollcallResult {
    constructor(JC, action) {
        this.journalClub = JC;
        this.action = action;
    }
}

/**
 * @class Journal club
 * @classdesc parsed and raw journal club information
 *
 * @property gitHubResponse {object} gitHub JC query response
 * @property lastUpdate {Date} last time the JC was updated
 * @property lastMessage {Date} last time a message was sent
 * @property lastMessageLevel {int} severity level of the last message
 * @property contactEmails {string[]} contact email addresses
 * @property title {string} journal club title
 * @property jcid {string} journal club id
 * @property token {string} journal club edit token
 */
class JournalClub {
    constructor(gitHubResponse) {
        this.gitHubResponse = gitHubResponse;
        this.parseContent();
        this.callback = null;
    }

    /**
     * Fetch the decoded string content of this JC's md file
     * @return {string}
     */
    get content() {
        return new Buffer.from(this.gitHubResponse.content, 'base64').toString('utf8');
    }

    /**
     * Extract the relevant content information from a journal club file
     */
    parseContent() {

        try {
            // Hack out the bits of the results we need
            const match = /^---(.*)---\s*(.*)$/s.exec(this.content);
            if (!match)
                throw new Error("Invalid journal club file - no YAML header found.");
            const yaml = YAML.parse(match[1])
            const lastUpdate = yaml['last-update-timestamp'];
            const lastMessage = yaml['last-message-timestamp'];
            const lastMessageLevel = yaml['last-message-level'];
            const jcid = yaml['jcid'];
            const title = yaml['title'];
            const contact = yaml['contact'];
            const additionalContacts = yaml['additional-contact'];
            // const lastUpdate = /^last-update-timestamp: "?(.*?)"?$/m.exec(this.content);
            // const lastMessage = /^last-message-timestamp: "?(.*?)"?$/m.exec(this.content);
            // const lastMessageLevel = /^last-message-level: "?(.*?)"?$/m.exec(this.content);
            // const jcid = /^jcid: "?(.*?)"?$/m.exec(this.content);
            // const title = /^title: "?(.*?)"?$/m.exec(this.content);
            // const contact = /^contact: "?(.*?)"?$/m.exec(this.content);
            // const additionalContacts = /^additional-contact: \[?"?([^\]]*?)"?]?$/m.exec(this.content);
            this.lastUpdate = lastUpdate? new Date(parseInt(lastUpdate[1]) * 1000) : new Date(0);
            this.lastMessage = lastMessage? new Date(parseInt(lastMessage[1]) * 1000) : new Date(0);
            this.lastMessageLevel = lastMessageLevel? parseInt(lastMessageLevel[1]) : MESSAGE_LEVELS.UP_TO_DATE;
            this.jcid = jcid || null;
            this.title = title || null;
            this.contactEmails = contact? [contact] : [];
            if(additionalContacts?.length) {
                this.contactEmails = [
                    ...this.contactEmails,
                    ...additionalContacts
                ];
            }
            this.contactEmails = this.contactEmails.map(e => {
                const trim = e.trim();
                const re = /^([^ ]+)/.exec(trim);
                if(re)
                    return re[1];
                else
                    return null;
            })
                .filter(e => e !== null)
        } catch (e) {
            console.error({
                message: "Error parsing journal club file",
                error: e,
                content: this.content
            });
            return null;
        }
    }

    /**
     * @return {int} flag representing the new message level
     */
    get newMessageLevel() {
        return this.lastMessageLevel + 1;
    }
}

/**
 * Perform a rollcall on each Journal Club.
 * A rollcall sends out an email to journal club contacts who have not updated
 * their journal club in the last year.
 * Thereafter, increasingly strident requests for checking in are sent each
 * month for two months.
 * If a journal club is not updated for 15 months it is marked as lapsed.
 * @return {RollcallResult[]}
 */
async function rollcall(callback) {
    console.log("Fetching journal club to rollcall...");
    const JC = await getOldestJC();
    console.log("Done");
    if (JC === null) {
        const response = `Rollcall: ${JC_TARGET? JC_TARGET : "All JCs"} okay.`;
        callback(null, {
            statusCode: 200,
            body: JSON.stringify(response)
        });
    }

    else {
        console.log(`Rollcalling ${JC.jcid}`);
        JC.callback = callback;
        await processRollcall(JC);
    }
}

/**
 * Send data back to the client
 * @param callback {function}
 * @param rc {RollcallResult}
 */
function finish(rc) {
    rc.journalClub.callback(null, {
        statusCode: / FAILED! /.test(rc.action)? 500 : 200,
        body: JSON.stringify(`Rollcall: ${rc.journalClub.jcid} -- ${rc.action}`)
    });
}

/**
 * Send appropriate emails and deactivate JC if required.
 * @param JC {JournalClub}
 */
async function processRollcall(JC) {
    const template = await fetch(
        `${GITHUB_REPO_API}/contents/_emails/rollcall-message-${JC.newMessageLevel}.json`,
        {
            headers: {
                'User-Agent': GITHUB_API_USER,
                Authorization: `token ${GITHUB_TOKEN}`
            }
        }
    )
        .then(r => r.json())
        .then(json => new Buffer.from(json.content, 'base64').toString('utf8'))
        .then(s => JSON.parse(s));

    // Update the template into a proper email
    const email = substituteHandlebars(
        template,
        {jcTitle: JC.title}
    );
    if(SANDBOX)
        email.subject = "[TESTING] " + email.subject;

    if (JC.newMessageLevel === MESSAGE_LEVELS.JC_DEACTIVATED)
        JC.contactEmails.push(FROM_EMAIL_ADDRESS); // cc RpT for deactivations

    // Send the email
    sendEmail(JC, email);
}

/**
 * Handle the follow-up from the Mailgun API call
 * @param JC {JournalClub}
 * @param emailFailed {Error|null}
 * @return {RollcallResult}
 */
async function updateJC(JC, emailFailed) {

    let action = ACTIONS[`action-${JC.newMessageLevel}`];
    let updateFailed = "";

    if(emailFailed && !SANDBOX) {
        console.warn({emailFailed});
    } else {
        // Trigger other actions
        if(JC.newMessageLevel >= MESSAGE_LEVELS.JC_DEACTIVATED)
            updateFailed = await deactivateJC(JC);
        else
            updateFailed = await updateMessageStatus(JC);
    }

    if(emailFailed)
        action = action + " EMAIL FAILED! " + emailFailed;
    else if(updateFailed)
        action = action +  " UPDATE FAILED! " + updateFailed;
    finish(new RollcallResult(JC, action));
}

/**
 * Replace {{ text }} with values from subs in all fields of template
 * @param template {object} series of strings on which to conduct replacement
 * @param subs {object} key-value pairs of handlebar content and the replacement values
 * @return {object} template with substitutions applied
 */
function substituteHandlebars(template, subs) {
    for(let s of Object.keys(template)) {
        if(!template.hasOwnProperty(s) || typeof template[s] !== 'string')
            continue;
        for(let k of Object.keys(subs)) {
            if(subs.hasOwnProperty(k)) {
                template[s] = template[s].replace(
                    new RegExp(`{{ *${k} *}}`),
                    subs[k]
                )
            }
        }
    }
    return template;
}

/**
 * Handle the Mailgun API call
 * @param JC {JournalClub}
 * @param email {subject: string, body: string} email to send
 */
function sendEmail(JC, email) {
    // Load mailgun
    const Mailgun = require('mailgun.js');
    const mailgun = new Mailgun(FormData);
    const mg = mailgun.client({
        username: 'api', key: MAILGUN_API_KEY, url: 'https://api.eu.mailgun.net'
    });

    const mailgunData = {
        from: FROM_EMAIL_ADDRESS,
        to: JC.contactEmails.shift(),
        'h:Reply-To': FROM_EMAIL_ADDRESS,
        subject: email.subject,
        html: email.body
    };
    if(JC.contactEmails.length)
        mailgunData.cc = JC.contactEmails.join(", ");

    console.log({mailgunData})

    mg.messages.create(MAILGUN_DOMAIN, mailgunData)
        .then(res => updateJC(JC))
        .catch(e => updateJC(JC, e));
}

/**
 * Move a journal club file to the _inactive-journal-clubs directory
 * @param JC {JournalClub} journal club to move (GitHub response object)
 */
function deactivateJC(JC) {
    console.log(`Deactivating ${JC.jcid}`);
    // Add the new file
    const content = JSON.stringify({
        message: `Rollcall: Archiving of ${JC.jcid}`,
        content: JC.gitHubResponse.content
    });
    const request = {
        method: 'PUT',
        headers: {
            'User-Agent': GITHUB_API_USER,
            Authorization: `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'Content-Length': content.length
        },
        body: content
    };
    return fetch(
        `${GITHUB_REPO_API}/contents/${JC.gitHubResponse.path.replace(/^_/, '_inactive-')}`,
        request
    )
        .then(r => {
            if(r.status !== 200 && r.status !== 201)
                throw new Error(`Could not archive: ${r.statusText} (${r.status})`)
            console.log("Archived file.")
        })
        .then(() => {
            // Remove the old file
            const remove = JSON.stringify({
                message: `Rollcall: Removing ${JC.gitHubResponse.path}`,
                sha: JC.gitHubResponse.sha
            });
            return fetch(
                JC.gitHubResponse.url,
                {
                    method: 'DELETE',
                    headers: {
                        'User-Agent': GITHUB_API_USER,
                        Authorization: `token ${GITHUB_TOKEN}`,
                        'Content-Type': 'application/json',
                        'Content-Length': remove.length
                    },
                    body: remove
                }
            )
                .then(r => {
                    if(r.status !== 200)
                        throw new Error(`Could not remove old file: ${r.statusText} (${r.status})`)
                    console.log("Deleted file")
                });
        })
        .catch(e => e);
}

/**
 * Update a journal club to indicate that a new message has been dispatched
 * @param JC {JournalClub}
 * @return {Error|null}
 */
function updateMessageStatus(JC) {
    console.log(`Updating last message time for ${JC.jcid}`);

    const body = JC.content;
    let newBody = body.replace(
        /last-message-timestamp: .+$/m,
        `last-message-timestamp: ${Math.floor((new Date()).getTime() / 1000)}`
    );
    newBody = newBody.replace(
        /last-message-level: .+$/m,
        `last-message-level: ${JC.newMessageLevel}`
    );
    // Commit to gitHub with the new body as content
    const newContent = new Buffer.from(newBody, 'utf8').toString('base64');
    const commit = JSON.stringify({
        message: `Rollcall: Update ${JC.jcid}.md last message time.`,
        content: newContent,
        sha: JC.gitHubResponse.sha
    });
    return fetch(
        JC.gitHubResponse.url,
        {
            method: 'PUT',
            headers: {
                'User-Agent': GITHUB_API_USER,
                Authorization: `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': commit.length
            },
            body: commit
        }
    )
        .then(r => {
            if(r.status !== 200) {
                throw new Error(`${r.statusText} (${r.status})`)
            } return null;
        })
        .catch(e => `Could not update last message time: ${e}`);
}

/**
 * Return a list of journal club objects as fetched from the GitHub repository.
 * @return {object[]}
 */
function getOldestJC() {
    return fetch(
        `${GITHUB_REPO_API}/contents/_journal-clubs`,
        {headers: {
                'User-Agent': GITHUB_API_USER,
                Authorization: `token ${GITHUB_TOKEN}`
            }}
    )
        .then(r => r.json())
        .then(async jcs => {
            console.log("Fetched JC list")
            const jc_details = await Promise.allSettled(jcs.map(jc => {
                let modified = new Date(0);
                return fetch(
                    jc.url,
                    {
                        headers: {
                            'User-Agent': GITHUB_API_USER,
                            Authorization: `token ${GITHUB_TOKEN}`
                        }
                    }
                )
                    .then(r => {
                        modified = new Date(r.headers.get("last-modified"));
                        return r.json();
                    })
                    .then(json => {
                        if(typeof json === "undefined")
                            console.warn(`undefined JC: ${jc.url}`)
                        json.modified = modified;
                        return new JournalClub(json);
                    });
            }));
            console.log("Fetched JC details")
            return jc_details.filter(jc => jc !== null);
        })
        // Has the JC been updated recently enough to skip?
        .then(jcs => jcs.filter(jc =>
            jc.lastUpdate < TOO_OLD && jc.lastMessage < TOO_RECENT
        ))
        .then(jcs => {
                if(!jcs.length)
                    return null;
                if(JC_TARGET) {
                    // Search for specific target
                    const x = jcs.filter(jc => {
                        if(!jc.jcid) {
                            console.warn(`No jcid for ${jc.gitHubResponse.path}.`);
                            return null;
                        }
                        return jc.jcid.toLowerCase() === JC_TARGET;
                    });
                    if(x.length)
                        return x[0];
                    return null;
                }
                // Find oldest
                return jcs.reduce((a, b) =>
                    b.gitHubResponse.modified.getTime() <
                    a.gitHubResponse.modified.getTime()?
                        b : a
                );
            }
        );
}

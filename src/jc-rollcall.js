// node fetch support
const fetch = require("node-fetch");
require('dotenv').config();
const faunadb = require('faunadb');
const FQ = faunadb.query;

let {GITHUB_REPO_API} = process.env;

const {
    GITHUB_API_USER,
    GITHUB_TOKEN,
    FAUNA_KEY,
    MAILGUN_API_KEY,
    MAILGUN_DOMAIN,
    MAILGUN_HOST,
    FROM_EMAIL_ADDRESS
} = process.env;

const MESSAGE_LEVELS = {
    UP_TO_DATE: 1,
    NOTIFICATION: 2,
    FIRST_REMINDER: 4,
    SECOND_REMINDER: 8,
    JC_DEACTIVATED: 16
};

const ACTIONS = {
    "action-2": "Notification sent.",
    "action-4": "First reminder sent.",
    "action-8": "Second reminder sent",
    "action-16": "Journal club deactivated."
};

const MAX_DAYS_SINCE_UPDATE = 365;
const MIN_DAYS_BETWEEN_EMAILS = 28;

const TOO_OLD = new Date()
    .setDate(new Date().getDate() - MAX_DAYS_SINCE_UPDATE);
const TOO_RECENT = new Date()
    .setDate(new Date().getDate() - MIN_DAYS_BETWEEN_EMAILS);

const ROLLCALL_DB = "rollcalls";

const TEMPLATES = {};

let SANDBOX = true;

exports.handler = function(event, context, callback) {
    SANDBOX = /^localhost(?::[0-9]+$|$)/i.test(event.headers.host);
    if(SANDBOX)
        GITHUB_REPO_API = process.env.GITHUB_REPO_API_SANDBOX;
    rateLimit()
        .then(() => rollcall())
        .then((summary)=>{
            callback(null, {
                statusCode: 200,
                body: JSON.stringify(summary)
            });
        })
        .then(() => saveRollcall())
        .then(() => {
            callback(null, {statusCode: 200, body: 'Rollcall complete.'})
        })
        .catch(e => callback(e));
};

/**
 * @class Rollcall result
 * @classdesc Contains the details of a rollcall result
 *
 * @property journalClub {object} journal club the result pertains to
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
    }

    /**
     * Fetch the decoded string content of this JC's md file
     * @return {string}
     */
    get content() {
        return new Buffer.from(this.gitHubResponse.content, 'base64').toString();
    }

    /**
     * Extract the relevant content information from a journal club file
     */
     parseContent() {

        // Hack out the bits of the results we need
        const lastUpdate = /^last-update-timestamp: (.*)$/m.exec(this.content);
        const lastMessage = /^last-message-timestamp: (.*)$/m.exec(this.content);
        const lastMessageLevel = /^last-message-level: (.*)$/m.exec(this.content);
        const jcid = /^jcid: (.*)$/m.exec(this.content);
        const title = /^title: (.*)$/m.exec(this.content);
        const contact = /^contact: (.*)$/m.exec(this.content);
        const additionalContacts = /^additional-contact: (.*)$/m.exec(this.content);
        this.lastUpdate = lastUpdate? new Date(parseInt(lastUpdate[1]) * 1000) : new Date(0);
        this.lastMessage = lastMessage? new Date(parseInt(lastMessage[1]) * 1000) : new Date(0);
        this.lastMessageLevel = lastMessageLevel? parseInt(lastMessageLevel[1]) : MESSAGE_LEVELS.UP_TO_DATE;
        this.jcid = jcid? jcid[1] : null;
        this.title = title? title[1] : null;
        this.contactEmails = [contact? contact[1] : ""];
        if(additionalContacts !== null) {
            this.contactEmails = [
                ...this.contactEmails,
                ...additionalContacts[1].split(', ')
            ];
        }
    }

    /**
     * @return {int} flag representing the new message level
     */
    get newMessageLevel() {
         if(typeof this.lastMessageLevel === "undefined")
             this.parseContent();
         return this.lastMessageLevel << 1;
    }
}

/**
 * Test whether a check was made in the last week
 * @param minDaysSinceLast {int} minimum days to wait before allowing another rollcall
 * @return {Promise<boolean>} whether rate-limiting has passed successfully
 */
function rateLimit(minDaysSinceLast = 6) {
    const client = new faunadb.Client({ secret: FAUNA_KEY });
    return client.query(
        FQ.Map(
            FQ.Paginate(FQ.Documents(FQ.Collection(ROLLCALL_DB))),
            FQ.Lambda("D", FQ.Get(FQ.Var("D")))
        )
    )
        .then(r => {
            r.data.forEach(x => {
                const oldDate = new Date(x.data.time);
                oldDate.setDate(oldDate.getDate() + minDaysSinceLast);
                if(oldDate < new Date().getDate())
                    throw new Error(`A rollcall was triggered more recently than ${minDaysSinceLast} days ago, at ${new Date(x.data.time).toISOString()}`);
            });
            return true;
        });
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
async function rollcall() {
    return await fetchJCs()
        .then(async JCs =>
            await Promise.allSettled(JCs.map(jc => rollcallJC(jc))))
        .then(JCs => {
            const results = {};
            for(jc of JCs) {
                if(typeof jc.action !== "string")
                    jc.action = "None";
                if(typeof results[jc.action] === "undefined")
                    results[jc.action] = 1;
                else
                    results[jc.action]++;
            }
            console.table(results);
        });
}

/**
 * Perform a rollcall on a journal club
 * @param jc {object} journal club gitHub response to rollcall
 * @return {RollcallResult}
 */
async function rollcallJC(jc) {
    const file = await fetch(
        jc.url,
        {
            headers: {
                'User-Agent': GITHUB_API_USER,
                Authorization: `token ${GITHUB_TOKEN}`
            }
        }
    )
        .then(r => r.json());
    const JC = new JournalClub(file);
    JC.parseContent();

    // Has the JC been updated recently enough?
    if(JC.lastUpdate >= TOO_OLD)
        return new RollcallResult(JC, null);

    // Have we sent an email recently?
    if(JC.lastMessage >= TOO_RECENT)
        return new RollcallResult(JC, null);

    // Send the appropriate email message
    return await processRollcall(JC);
}

/**
 * Send appropriate emails and deactivate JC if required.
 * @param JC {JournalClub}
 * @return {Promise<RollCallResult>}
 */
async function processRollcall(JC) {
    // Do we have a cached version of the message template?
    if(!TEMPLATES.hasOwnProperty(`message-${JC.newMessageLevel}`))
        TEMPLATES[`message-${JC.newMessageLevel}`] = await fetch(
            `${GITHUB_REPO_API}/contents/_emails/message-${JC.newMessageLevel}.json`,
            {
                headers: {
                    'User-Agent': GITHUB_API_USER,
                    Authorization: `token ${GITHUB_TOKEN}`
                }
            }
        )
            .then(r => r.json())
            .then(json => new Buffer.from(json.content, 'base64').toString())
            .then(s => JSON.parse(s));
    const template = TEMPLATES[`messages-${JC.newMessageLevel}`];

    // Update the template into a proper email
    const email = substituteHandlebars(
        template,
        {jcTitle: JC.title}
    );

    // Send the email
    if(JC.newMessageLevel == MESSAGE_LEVELS.JC_DEACTIVATED)
        JC.contactEmails.push(FROM_EMAIL_ADDRESS); // cc RpT for deactivations
    await sendEmail(JC.contactEmails, email.subject, email.body);

    // Trigger other actions
    if(JC.newMessageLevel === MESSAGE_LEVELS.JC_DEACTIVATED)
        deactivateJC(JC.gitHubResponse);
    else
        updateMessageStatus(JC);

    const action = ACTIONS[`action-${JC.newMessageLevel}`];
    console.log(`Action for ${JC.jcid}: ${action}`)
    return RollcallResult(JC.gitHubResponse, action);
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
 * @param email {string[]} email to send to
 * @param subject {string} email subject
 * @param body {string} email body (HTML)
 * @return {Promise<{details: Array, title: string, status: string}>|true} a formatted response report
 */
async function sendEmail(emails, subject, body) {
    // Load mailgun
    const mailgun = require('mailgun-js')({
        apiKey: MAILGUN_API_KEY,
        domain: MAILGUN_DOMAIN,
        host: MAILGUN_HOST
    });

    const mailgunData = {
        from: FROM_EMAIL_ADDRESS,
        to: emails.shift(),
        'h:Reply-To': FROM_EMAIL_ADDRESS,
        subject: subject,
        html: body
    };
    if(emails.length)
        mailgunData.cc = emails.join("; ");

    if(SANDBOX) {
        console.log(`SANDBOX MODE: skipping send email:`);
        console.log(mailgunData);
        return true;
    }

    return mailgun.messages()
        .send(mailgunData);
}

/**
 * Move a journal club file to the _inactive-journal-clubs directory
 * @param jc {object} journal club to move (GitHub response object)
 */
function deactivateJC(jc) {
    // Add the new file
    const content = JSON.stringify({
        message: `Rollcall: Archiving of ${jc.name}`,
        content: jc
    });
    fetch(
        `${GITHUB_REPO_API}/${jc.path.replace(/^_/, '_inactive-')}`,
        {
            method: 'PUT',
            headers: {
                'User-Agent': GITHUB_API_USER,
                Authorization: `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': content.length
            },
            body: content
        }
    )
        .then(r => {
            if(r.status !== 200)
                throw new Error(`Could not archive ${jc.name}: ${r.statusText} (${r.status})`)
        })
        .then(() => {
            // Remove the old file
            const remove = JSON.stringify({
                message: `Rollcall: Removing ${jc.path}`,
                sha: jc.sha
            });
            fetch(
                jc.url,
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
            );
        });
}

/**
 * Update a journal club to indicate that a new message has been dispatched
 * @param JC {JournalClub}
 */
function updateMessageStatus(JC) {
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
    const newContent = new Buffer.from(newBody).toString('base64');
    const commit = JSON.stringify({
        message: `Rollcall: Update ${data.jcid}.md last message time.`,
        content: new Buffer.from(out.githubFile).toString('base64'),
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
    );
}

/**
 * Return a list of journal club objects as fetched from the GitHub repository.
 * @return {object[]}
 */
function fetchJCs() {
    return fetch(
        `${GITHUB_REPO_API}/contents/_journal-clubs`,
        {headers: {
            'User-Agent': GITHUB_API_USER,
            Authorization: `token ${GITHUB_TOKEN}`
        }}
    )
        .then(r => r.json())
}

function saveRollcall() {

    if(SANDBOX) {
        console.log(`SANDBOX MODE: skipping register Rollcall.`);
        return true;
    }

    const client = new faunadb.Client({ secret: FAUNA_KEY });
    return client.query(
        FQ.Create(
            FQ.Collection(ROLLCALL_DB),
            {
                data: {
                    time: new Date().toJSON()
                }
            }
        )
    )
}

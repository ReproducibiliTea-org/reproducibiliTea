// node fetch support
const fetch = require("node-fetch");
require('dotenv').config();
const { MongoClient } = require('mongodb');
const Mailgun = require("mailgun.js");

const {
    MONGODB_URI,
    MONGODB_DB,
    MAILGUN_API_KEY,
    MAILGUN_DOMAIN,
    GITHUB_API_USER,
    FROM_EMAIL_ADDRESS
} = process.env;

let {GITHUB_REPO_API} = process.env;

exports.handler = async function(event, context, callback) {
    let client;
    try {
        console.log("# Generating edit token - begin")
        // Switch to Sandbox mode if we're on the sandbox account
        const sandbox = /(sandbox|localhost)/.test(event.headers.referer);
        if(sandbox) {
            const {GITHUB_REPO_API_SANDBOX} = process.env;

            GITHUB_REPO_API = GITHUB_REPO_API_SANDBOX;
            console.log("Sandbox mode enabled")
        }

        // Check input
        const data = JSON.parse(event.body);
        if(data.email)
            data.email = data.email.replace(/\s/sg, '');
        if(!data.email || !data.jcid) {
            console.log("Invalid input:", data)
            return callback('Email and JCID must be submitted in JSON format in the request body.');
        }
        console.log("Generating token for", data.email, "and JCID", data.jcid)

        // Create the token
        const token = encodeURI(data.email).substring(0, 10) +
            Math.round(Math.random() * 100000000000000000);

        console.log("Token generated.")

        // Check JC exists on GitHub
        const ghResponse = await fetch(
            `${GITHUB_REPO_API}/contents/_journal-clubs`,
            {headers: {'User-Agent': GITHUB_API_USER}}
        );
        const jcList = await ghResponse.json();
        const jcNames = jcList.map(jc => jc.name);
        if(!jcNames.includes(`${data.jcid}.md`)) {
            console.error(`JCID ${data.jcid} not found on GitHub.`);
            return callback(`Requested journal club ${data.jcid} does not exist.`);
        }

        console.log("JCID verified on GitHub.")

        // Proceed with DB operations
        const dbConnection = await getDatabase();
        client = dbConnection.client;
        const count = await dbConnection.collection.countDocuments({
            jcid: data.jcid,
            email: data.email,
            expires: { $lt: new Date() }
        });
        if (count > 5) {
            console.error(`Too many recent edit attempts for ${data.jcid} and ${data.email} (count: ${count})`);
        } else {
            console.log(`Live edit attempts for ${data.jcid} and ${data.email}: ${count}`);
        }

        if(!data.message)
            data.message = "";
        const now = new Date();
        const expires = now.setDate(now.getDate() + 2);

        // Save to the database
        console.log("Saving token to database.")
        update = await dbConnection.collection.insertOne({
            token: token,
            jcid: data.jcid,
            email: data.email,
            message: data.message,
            expires: new Date(expires)
        });

        console.log(`Saved token ${token}`);
        // Email token to user
        if(data.email !== "rollcall" && !sandbox) {
            console.log("Sending email to", data.email);
            await sendEmail(data.email, data.jcid, token);
        }

        console.log("# Generating edit token - end")
        console.log("################################################################")
        callback(null, {
            statusCode: 200,
            body: 'Token created successfully.'
        });
    } catch (e) {
        console.error(e);
        console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
        if(e.isDbConnection)
            callback(e.message);
        else
            callback(e);
    }
    finally {
        if(client)
            await client.close();
    }
};

/**
 * Establish a MongoDB connection
 */
async function getDatabase() {
    try {
        if(!MONGODB_URI || !MONGODB_DB) {
            const missing = !MONGODB_URI? 'MONGODB_URI' : 'MONGODB_DB';
            const dbError = new Error(`Database connection failed: environment variable ${missing} is not configured.`);
            dbError.isDbConnection = true;
            throw dbError;
        }
        console.log(`Connecting to ${MONGODB_DB}`);
        const mongo = new MongoClient(MONGODB_URI);
        await mongo.connect();
        console.log("Connected.");
        return { client: mongo, collection: mongo.db(MONGODB_DB).collection('editTokens') };
    } catch (error) {
        console.error(`Failed: ${error.message}`);
        const dbError = new Error(`Database connection failed: ${error.message}`);
        dbError.isDbConnection = true;
        throw dbError;
    }
}

/**
 * Handle the Mailgun API call
 * @param email {string} email to send to
 * @param jcid {string} journal club to edit
 * @param token {string} token to inject into the link
 * @return {Promise<{details: Array, title: string, status: string}>} a formatted response report
 */
async function sendEmail(email, jcid, token) {
    // Load mailgun
    const Mailgun = require('mailgun.js');
    const mailgun = new Mailgun(FormData);
    const mg = mailgun.client({
        username: 'api', key: MAILGUN_API_KEY, url: 'https://api.eu.mailgun.net'
    });


    const mailgunData = {
        from: FROM_EMAIL_ADDRESS,
        to: email,
        'h:Reply-To': FROM_EMAIL_ADDRESS,
        subject: `Edit ReproducibiliTea ${jcid}.md link`,
        html: `
<p>Dear ReproducibiliTea Journal Club organiser,</p>
<p>An access token has been requested for your email address so that you can make edits to the journal club entry for ${jcid}.md on reproducibiliTea.org.</p>
<p>To make the edits, please follow the link below, which will take you to the page where you can edit the journal club details.</p>
<p><a href="https://reproducibiliTea.org/join-reproducibiliTea/?jcEditToken=${token}">https://reproducibiliTea.org/join-reproducibiliTea/?jcEditToken=${token}</a></p>
<p>This link will expire in 24h.</p>
<p>Thanks,</p>
<p>The ReproducibiliTea Web Team</p>
        `
    };

    console.log({mailgun, mailgunData})

    await mg.messages.create(MAILGUN_DOMAIN, mailgunData);
}


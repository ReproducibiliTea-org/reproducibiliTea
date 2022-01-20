// node fetch support
const fetch = require("node-fetch");
require('dotenv').config();
const faunadb = require('faunadb');
const FQ = faunadb.query;

const {
    FAUNA_KEY,
    MAILGUN_API_KEY,
    MAILGUN_DOMAIN,
    MAILGUN_HOST,
    GITHUB_API_USER,
    FROM_EMAIL_ADDRESS
} = process.env;

let {GITHUB_REPO_API} = process.env;

exports.handler = function(event, context, callback) {
    // Switch to Sandbox mode if we're on the sandbox account
    const sandbox = /(sandbox|localhost)/.test(event.headers.referer);
    if(sandbox) {
        const {GITHUB_REPO_API_SANDBOX} = process.env;

        GITHUB_REPO_API = GITHUB_REPO_API_SANDBOX;
    }

    // Check input
    const data = JSON.parse(event.body);
    if(data.email)
        data.email = data.email.replace(/\s/sg, '');
    if(!data.email || !data.jcid) {
        return callback('Email and JCID must be submitted in JSON format in the request body.');
    }

    const client = new faunadb.Client({ secret: FAUNA_KEY });

    // Create the token
    const token = encodeURI(data.email).substr(0,10) +
        Math.round(Math.random() * 100000000000000000);

    // Check JC exists on GitHub
    fetch(
        `${GITHUB_REPO_API}/contents/_journal-clubs`,
        {headers: {'User-Agent': GITHUB_API_USER}})
        .then(r => r.json())
        .then(jcList => {
            for(const jc of jcList) {
                if(jc.name === `${data.jcid}.md`)
                    return;
            }
            throw new Error(`Requested journal club ${data.jcid} does not exist.`);
        })
        .then(async () => {
            return await client.query(
                FQ.Map(
                    FQ.Paginate(
                        FQ.Filter(
                            FQ.Match(FQ.Index('by_owner'), [ data.jcid, data.email ]),
                            FQ.Lambda(
                                "x",
                                FQ.GT(FQ.Now(), FQ.Select(["data", "expires"], FQ.Get(FQ.Var("x"))))
                            )
                        )
                    ),
                    FQ.Lambda("D", FQ.Get(FQ.Var("D")))
                )
            )
        })
        .then(r => {
            if(r.data.length > 5)
                throw new Error('Too many recent edit attempts for this journal club. Please check your email (including junk folders) for recent access tokens.')
        })
        .then(() => {
            if(!data.message)
                data.message = "";
            const now = new Date();
            const expires = now.setDate(now.getDate() + 2);

            // Save to the database
            return client.query(
                FQ.Create(
                    FQ.Collection('editTokens'),
                    {
                        data: {
                            token: token,
                            jcid: data.jcid,
                            email: data.email,
                            message: data.message,
                            expires: new Date(expires).toJSON()
                        }
                    }
                )
            )
        })
        .then(async () => {
            console.log(`Saved token ${token}`);
            // Email token to user
            if(data.email !== "rollcall" && !sandbox)
                await sendEmail(data.email, data.jcid, token);
        })
        .then(()=>{
            callback(null, {
                statusCode: 200,
                body: 'Token created successfully.'
            });
        })
        .catch(e => {console.log(`Token generator error: ${e}`); callback(e)});
};

/**
 * Handle the Mailgun API call
 * @param email {string} email to send to
 * @param jcid {string} journal club to edit
 * @param token {string} token to inject into the link
 * @return {Promise<{details: Array, title: string, status: string}>} a formatted response report
 */
async function sendEmail(email, jcid, token) {
    // Load mailgun
    const mailgun = require('mailgun-js')({
        apiKey: MAILGUN_API_KEY,
        domain: MAILGUN_DOMAIN,
        host: MAILGUN_HOST
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

    await mailgun.messages()
        .send(mailgunData);
}


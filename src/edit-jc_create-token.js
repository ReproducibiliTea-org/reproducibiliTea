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
    FROM_EMAIL_ADDRESS
} = process.env;

exports.handler = function(event, context, callback) {
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
        'https://api.github.com/repos/mjaquiery/reproducibiliTea/contents/_journal-clubs',
        {headers: {'User-Agent': 'mjaquiery'}})
        .then(r => r.json())
        .then(jcList => {
            for(const jc of jcList) {
                if(jc.name === `${data.jcid}.md`)
                    return;
            }
            throw new Error(`Requested journal club ${data.jcid} does not exist.`);
        })
        .then(() => {
            // Protect against flooding (max 5 active entries per JC)
            return client.query(
                FQ.Map(
                    FQ.Paginate(FQ.Documents(FQ.Collection("editTokens"))),
                    FQ.Lambda("D", FQ.Get(FQ.Var("D")))
                )
            )
        })
        .then(r => {
            let count = 5;
            r.data.forEach(x => {
                if(x.data.jcid === data.jcid)
                    count--;
            });
            if(!count)
                throw new Error('Too many recent edit attempts for this journal club. Please check your email (including junk folders) for recent access tokens.')
        })
        .then(() => {
            if(!data.message)
                data.message = "";
            // Save to the database
            return client.query(
                FQ.Create(
                    FQ.Collection('editTokens'),
                    {
                        data: {
                            token: token,
                            jcid: data.jcid,
                            email: data.email,
                            message: data.message
                        }
                    }
                )
            )
        })
        .then(async () => {
            // Email token to user
            await sendEmail(data.email, data.jcid, token);
        })
        .then(()=>{
            callback(null, {
                statusCode: 200,
                body: 'Token created successfully.'
            });
        })
        .catch(e => callback(e));
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


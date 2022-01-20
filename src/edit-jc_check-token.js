// node fetch support
require('dotenv').config();
const faunadb = require('faunadb');
const FQ = faunadb.query;

const {FAUNA_KEY} = process.env;

let {GITHUB_REPO_API} = process.env;

const URL = `${GITHUB_REPO_API}/contents/_journal-clubs`;

exports.handler = function(event, context, callback) {
    // Switch to Sandbox mode if we're on the sandbox account
    if(/(sandbox|localhost)/.test(event.headers.referer) ||
        event.headers.sandbox === 'true') {
        const {GITHUB_REPO_API_SANDBOX} = process.env;

        GITHUB_REPO_API = GITHUB_REPO_API_SANDBOX;
    }

    // Check input
    const data = JSON.parse(event.body);
    if(!data.token) {
        return callback('Authorisation token must be specified in JSON format in the request body.');
    }

    // Fetch the available tokens
    const client = new faunadb.Client({ secret: FAUNA_KEY });
    client.query(
        FQ.Map(
            FQ.Paginate(FQ.Match(FQ.Index('by_token'), data.token), {size:1}),
            FQ.Lambda("D", FQ.Get(FQ.Var("D")))
        )
    )
        // Check the token we've been supplied against the tokens
        // Return the token data if it matches
        .then(r => {
            let tokenOK = false;
            r.data.forEach(x => {
                if(x.data.token === data.token) {
                    if(!x.data.expires || x.data.expires < new Date())
                        throw new Error('The token has expired.');
                    tokenOK = true;
                    return callback(null, {
                        statusCode: 200,
                        body: JSON.stringify(x.data)
                    });
                }
            });
            if(!tokenOK)
                throw new Error('No matching token found.')
        })
        .catch(e => callback(e));
};

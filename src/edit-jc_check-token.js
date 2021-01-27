// node fetch support
const fetch = require("node-fetch");
require('dotenv').config();
const faunadb = require('faunadb');
const FQ = faunadb.query;

const {FAUNA_KEY, GITHUB_API_USER} = process.env;

const URL = `https://api.github.com/repos/${GITHUB_API_USER}/reproducibiliTea/contents/_journal-clubs`;

exports.handler = function(event, context, callback) {
    // Check input
    let token = null;
    const data = JSON.parse(event.body);
    if(!data.token) {
        return callback('Authorisation token must be specified in JSON format in the request body.');
    }

    // Fetch the available tokens
    const client = new faunadb.Client({ secret: FAUNA_KEY });
    client.query(
        FQ.Map(
            FQ.Paginate(FQ.Documents(FQ.Collection("editTokens"))),
            FQ.Lambda("D", FQ.Get(FQ.Var("D")))
        )
    )
        // Check the token we've been supplied against the tokens
        // Return the token data if it matches
        .then(r => {
            r.data.forEach(x => {
                if(x.data.token === data.token) {
                    if(!x.data.expires || x.data.expires < new Date())
                        throw new Error('The token has expired.');
                    return callback(null, {
                        statusCode: 200,
                        body: JSON.stringify(x.data)
                    });
                }
            });
            throw new Error('No matching token found.')
        })
        .catch(e => callback(e));
};
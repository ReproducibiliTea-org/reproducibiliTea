require('dotenv').config();
const { verifyToken } = require('./lib/tokens');

const { EDIT_TOKEN_SECRET } = process.env;

exports.handler = async function(event) {
    let data;
    try {
        data = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: 'Request body must be valid JSON.' };
    }

    if (!data.token) {
        return { statusCode: 400, body: 'Authorisation token must be specified in JSON format in the request body.' };
    }

    const result = verifyToken(data.token, EDIT_TOKEN_SECRET);
    if (!result.valid) {
        console.log(JSON.stringify({ event: 'check_token_rejected', reason: result.reason }));
        return { statusCode: 401, body: `Token invalid: ${result.reason}` };
    }

    console.log(JSON.stringify({ event: 'check_token_accepted', jcid: result.payload.jcid }));
    return { statusCode: 200, body: JSON.stringify(result.payload) };
};

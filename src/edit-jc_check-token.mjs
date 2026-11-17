import 'dotenv/config';
import tokens from './lib/tokens.js';
import envDiagnostics from './lib/env-diagnostics.js';

const { verifyToken } = tokens;
const { logMisconfigured } = envDiagnostics;

const { EDIT_TOKEN_SECRET } = process.env;

export default async (req) => {
    if (!EDIT_TOKEN_SECRET) {
        logMisconfigured('check_token_misconfigured');
        return new Response('Server misconfiguration.', { status: 500 });
    }

    let data;
    try {
        data = JSON.parse(await req.text());
    } catch (e) {
        return new Response('Request body must be valid JSON.', { status: 400 });
    }

    if (!data || !data.token) {
        return new Response('Authorisation token must be specified in JSON format in the request body.', { status: 400 });
    }

    const result = verifyToken(data.token, EDIT_TOKEN_SECRET);
    if (!result.valid) {
        console.log(JSON.stringify({ event: 'check_token_rejected', reason: result.reason }));
        return new Response(`Token invalid: ${result.reason}`, { status: 401 });
    }

    if (result.payload.purpose !== 'edit') {
        console.log(JSON.stringify({ event: 'check_token_rejected', reason: 'wrong_purpose' }));
        return new Response('Token invalid: wrong_purpose', { status: 401 });
    }

    console.log(JSON.stringify({ event: 'check_token_accepted', jcid: result.payload.jcid }));
    return new Response(JSON.stringify(result.payload), { status: 200 });
};

export const config = {
    path: '/api/v1/edit-jc_check-token',
    rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip'] }
};

// node fetch support
const fetch = require("node-fetch");
require('dotenv').config();

// Extract .env variables
const {
    GITHUB_TOKEN,
    GITHUB_API_USER
} = process.env;

/**
 * Look up each JC.md file, and make sure each one has a jcid field which contains its filename
 * @param event
 * @param context
 * @param callback
 * @return {Promise<*>}
 */
exports.handler = async (event, context, callback) => {
    const url = `https://api.github.com/repos/${GITHUB_API_USER}/reproducibiliTea/contents/_journal-clubs`;

    fetch(url, {
        headers: {
            'User-Agent': GITHUB_API_USER,
            Authorization: `token ${GITHUB_TOKEN}`
        }
    })
        .then(r => r.json())
        .then(async json => {
            for(const jc of json) {
                await fetch(`${url}/${encodeURI(jc.name)}`, {
                    headers: {
                        'User-Agent': GITHUB_API_USER,
                        Authorization: `token ${GITHUB_TOKEN}`
                    }
                })
                    .then(r => r.json())
                    .then(async f => {
                        const buff = new Buffer.from(f.content, 'base64');
                        const body = buff.toString();
                        const name = /^(.+)\.md$/.exec(f.name)[1];
                        const match = RegExp(`^jcid: (${name})`).exec(body);
                        if(!match) {
                            // Add the jcid field
                            const updatedBody = body.replace(/^---.*\n/, `---\njcid: ${name}\n`);
                            const updatedBuffer = Buffer.from(updatedBody);
                            const content = updatedBuffer.toString('base64');
                            // Commit the change
                            const commit = {
                                message: `Adding jcid to ${f.name}`,
                                content: content,
                                sha: f.sha
                            };
                            const payload = JSON.stringify(commit);
                            await fetch(`${url}/${encodeURI(jc.name)}`, {
                                method: 'PUT',
                                headers: {
                                    'User-Agent': GITHUB_API_USER,
                                    Authorization: `token ${GITHUB_TOKEN}`,
                                    'Content-Type': 'application/json',
                                    'Content-Length': payload.length
                                },
                                body: payload
                            })
                                .then(r => console.log(`Updated ${jc.name} (${r.status} - ${r.statusText})`))
                                .catch(e => console.warn(`${jc.name} update failed with: ${e}`))
                        } else {
                            if(match[1] !== name){
                                console.warn(`${f.name} has jcid ${match[1]}`);
                            }
                        }
                    })
                    .catch(e => (console.warn(`Error in fetching ${jc.name}: ${e}`)));
            }
        })
        .then(r => callback(null, {statusCode: 200, body: 'Okay'}))
        .catch(e => callback(e));


};

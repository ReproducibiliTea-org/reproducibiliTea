// node fetch support
const fetch = require("node-fetch");
require('dotenv').config();

// Extract .env variables
const {
    AUTH_CODE,
    OSF_TOKEN,
    GITHUB_TOKEN,
    ZOTERO_TOKEN,
    SLACK_TOKEN,
    SLACK_LINK,
    EMAIL_REPORT_TO,
    MAILGUN_API_KEY,
    MAILGUN_DOMAIN,
    MAILGUN_HOST,
    FROM_EMAIL_ADDRESS
} = process.env;


const OPTIONAL_FIELDS = [
    'www', 'twitter', 'description', 'osfUser', 'zoteroUser',
    'signup', 'uniWWW', 'osf'
];

const REQUIRED_FIELDS = [
    'jcid', 'name', 'uni', 'email', 'post',
    'country', 'lead', 'authCode', 'geolocation'
];

exports.handler = async (event, context, callback) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed', headers: { 'Allow': 'POST' } }
    }

    let data = {};

    try{
        data = cleanData(JSON.parse(event.body));
    } catch(e) {
        return {
            statusCode: 400,
            body: '<p>Could not clean submission for processing</p>'
        };
    }

    let isEdit = false;
    let token = data.editToken;
    let editToken = null;
    if(token) {
        // Check authorisation to edit
        editToken = await fetch(`${event.headers.origin}/.netlify/functions/edit-jc_check-token`, {
            method: 'POST',
            body: token
        })
            .then(r => {
                if(r.status !== 200)
                    throw new Error(`Token lookup error: server response was (${r.status}) (${r.statusText}).`);
                else
                    return r.json()
            })
            .catch(e => {return {
                    title: 'Check edit token',
                    status: 'error',
                    details: [e]
            }});

        console.log({editToken})
        if(!editToken.jcid)
            return {
                statusCode: 500,
                body: formatResponses({checkToken: {
                    title: 'Check edit token',
                    status: 'error',
                    details: [`No JC listed for token ${JSON.parse(token).token}.`]
                }})
            };
        if(editToken.jcid !== data.jcid)
            return {
                statusCode: 500,
                body: formatResponses({checkToken: {
                    checkJCID: {
                        title: 'Check edit token',
                        status: 'error',
                        details: [
                            `Token journal club '${editToken.jcid}' did not match requested journal club '${data.jcid}'.`
                        ]
                    }
                }})
            };
        isEdit = true;
        // Cheat the auth code because the token provides authorisation
        data.authCode = AUTH_CODE;
    }

    const check = checkData(data, isEdit);

    if (check !== null) {
        return check;
    }

    // From here we continue regardless of success, we just record the success/failure status of the series of API calls
    let body;
    if(isEdit)
        body = {github: await callGitHub(data, null, editToken)};
    else
        body = await callAPIs(data);

    return {statusCode: 200, body: formatResponses(body)};
};

/**
 * Clean the incoming data
 * @param data {object} POST data in request
 * @return {object} cleaned POST data
 */
function cleanData(data) {
    // ensure the whole form has at least empty strings
    // mandatory fields are checked later
    for(const s of OPTIONAL_FIELDS) {
        if(!data.hasOwnProperty(s))
            data[s] = "";
    }

    if(data.post) {
        data.post = data.post.replace(/,\s*/g, '\n');
        data.post = data.post.replace(/[\n\r]\r?/g, ', ');
        data.post = data.post.replace(/  /sg, ' ');
    }

    if(data.jcid)
        data.jcid = data.jcid.toLowerCase();

    // Remove leading and trailing spaces from all string fields
    for(const x in data) {
        if(typeof data[x] !== "string")
            continue;
        const match = /^\s*([\S\s]*\S+)\s*$/i.exec(data[x]);
        if(match)
            data[x] = match[1];
    }

    // Remove the unnecessary bits of the OSF user input
    if(data.osf && data.osf.length) {
        const match = /^(?:https?:\/\/osf.io\/)?([0-9a-z]+)\/?$/i
            .exec(data.osfUser);
        if(match)
            data.osfUser = match[1];
    }
    if(data.osfUser && data.osfUser.length) {
        const match = /^(?:https?:\/\/osf.io\/)?([0-9a-z]+)\/?$/i
            .exec(data.osfUser);
        if(match)
            data.osfUser = match[1];
    }

    // Concatenate helper list into array
    data.helpers = [];
    for(let i = 0; data.hasOwnProperty('helper' + i.toString()); i++)
        if(data['helper' + i.toString()].length)
            data.helpers.push(data['helper' + i.toString()]);

    // Concatenate email list into array
    data.emails = [];
    for(let i = 0; data.hasOwnProperty('extraEmail' + i.toString()); i++)
        if(data['extraEmail' + i.toString()].length)
            data.emails.push(data['extraEmail' + i.toString()]);

    // Remove the @ at the beginning of twitter usernames because YAML doesn't allow entries to start with @
    if(data.twitter)
        while(data.twitter[0] === "@")
            data.twitter = data.twitter.substr(1);

    // Sort geolocation data to be [int:lat, int:lng]
    if(data.geolocation) {
        const d = data.geolocation.split(',');
        data.geolocation = d.map(a => parseFloat(a));
    }

    return data;
}

/**
 * Check the request for hygiene, completeness, and sanity
 * @param data {object} POST data in request
 * @return {object|null} a http response on error or null if okay
 */
function checkData(data) {
    const fail = (s, c = 400) => ({
        statusCode: c, body: formatResponses({
            check: {
                title: 'Data check',
                status: 'Error',
                details: [s]
            }
        })
    });

    for(const x of REQUIRED_FIELDS) {
        if(!data.hasOwnProperty(x))
            return fail(`The request is missing mandatory field \'${x}\'.`)
    }

    if(!/^[a-z0-9\-]+$/i.test(data.jcid))
        return fail(`The id field ("${data.jcid}") contains invalid characters.`);

    if(!/^[a-z0-9]*$/i.test(data.osf))
        return fail(`The OSF repository ("${data.osf}") contains invalid characters.`);

    if(!/^[a-z0-9]*$/i.test(data.osfUser))
        return fail(`The OSF username ("${data.osfUser}") contains invalid characters.`);

    if(!/^[0-9]*$/i.test(data.zoteroUser))
        return fail(`The Zotero username ("${data.zoteroUser}") contains invalid characters.`);

    // check email has an x@y structure
    if(!/\S+@\S+/i.test(data.email))
        return fail(`The email address supplied("${data.email}") appears invalid.`);

    // check extra emails have an x@y structure
    for(let i = 0; i < data.emails.length; i++) {
        if(!/\S+@\S+/i.test(data.emails[i]))
            return fail(`The email address supplied("${data.emails[i]}") appears invalid.`);
    }

    if(data.authCode !== AUTH_CODE) {
        return fail(`The authorisation code supplied("${data.authCode}") is invalid.`)
    }

    if(!data.geolocation || data.geolocation.length !== 2 || !data.geolocation.reduce((p, c) => p && isFinite(c))) {
        return fail("The geolocation data is not in the correct format.");
    }

    return null;
}

/**
 * Send off the JC data to the various APIs we use for setting things up
 * @param data
 * @returns {Promise<{zotero: *, osf: *, slack: *}>}
 */
async function callAPIs(data, isEdit = false) {
    const [slack, osf, zotero] = await Promise.all([
        callSlack(data),
        callOSF(data),
        callZotero(data)
    ]);

    const results = {slack, osf, zotero};

    // Some API calls require info we only have after others are made...
    results.github = await callGitHub(data, results);
    results.mailgun = await callMailgun(data, results);

    return results;
}

/**
 * Format a set of responses from API calls
 * @param re {object} dictionary of response objects
 * @return {string} HTML response body
 */
function formatResponses(re) {

    let out = "";

    for(const s in re) {
        if(!re.hasOwnProperty(s))
            continue;

        const r = re[s];

        out += `
<div class="${r.status.toLowerCase()}">
<h2>${r.title} - <span class="${r.status.toLowerCase()}">${r.status}</span></h2>
`;
        out += '<ul>';
        for(const task of r.details) {
            out += `
    <li>${task}</li>`;
        }
        out += '</ul></div>';
    }
    return out;
}

/**
 * Handle the OSF API call
 * @param data {object} form POST data
 * @return {Promise<{details: Array, title: string, status: string}>} a formatted response report
 */
async function callOSF(data) {
    const out = {
        title: 'OSF',
        status: 'Okay',
        details: [],
        osfRepoId: null
    };

    if(data.osf && data.osf.length) {
        out.details.push('A pre-existing OSF repository was supplied, so that will be registered as the journal club\'s OSF link.');
        out.osfRepoId = data.osf;
        return out;
    }

    const osfURL = 'https://api.osf.io/v2/';
    const osfParentRepo = 'cfby7';

    // Check for existing OSF repository
    try {
        const call = await fetch(`${osfURL}nodes/${osfParentRepo}/children/?filter[title]=${encodeURI(data.name)}`,
            {
                headers: {
                    Authorization: `Bearer ${OSF_TOKEN}`
                }
            });
        if(!call.ok) {
            throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        }

        const response = await call.json();

        if(response.data && response.data.length) {
            out.status = 'Warning';
            out.details.push('An OSF repository with a similar name already exists; another will not be created.');

            return out;
        }
    } catch(e) {
        out.status = 'Error';
        out.details.push('An error occurred: ' + e.toString());

        return out;
    }

    // Add new OSF repository
    const makeJC = {
        data: {
            type: 'nodes',
            attributes: {
                title: `ReproducibiliTea ${data.name}`,
                category: 'communication',
                description: `Materials from ReproducibiliTea sessions in ${data.name}. Templates and presentations are available for others to use and edit.`,
                'public': '1'
            }
        }
    };

    try {
        const call = await fetch(`${osfURL}nodes/${osfParentRepo}/children/`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${OSF_TOKEN}`,
                    'Content-Type': 'application/vnd.api+json'
                },
                body: JSON.stringify(makeJC)
            });
        if(!call.ok) {
            throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        }

        const response = await call.json();

        if(!response.data || !response.data.id) {
            out.status = 'Error';
            out.details.push('Unable to create OSF repository.');

            return out;
        } else {
            out.details.push(`Created new OSF repository at <a href="https://osf.io/${response.data.id}" target="_blank">https://osf.io/${response.data.id}</a>.`);
            out.osfRepoId = response.data.id;
        }
    } catch(e) {
        out.status = 'Error';
        out.details.push('An error occurred while creating the repository. ' + e.toString());

        return out;
    }

    // Add the JC lead as a contributor to the OSF repository
    if(!data.osfUser || !data.osfUser.length) {
        return out;
    }

    const addUser = {
        data: {
            type: 'contributors',
            attributes: {
                permission: "admin"
            },
            relationships: {
                user: {
                    data: {
                        type: 'users',
                        id: data.osfUser
                    }
                }
            }
        }
    };

    try {
        const call = await fetch(`${osfURL}nodes/${out.osfRepoId}/contributors/`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${OSF_TOKEN}`,
                    'Content-Type': 'application/vnd.api+json'
                },
                body: JSON.stringify(addUser)
            });
        if(!call.ok) {
            throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        }

        await call.json();

        out.details.push('Added the user as a contributor to the repository.');

    } catch(e) {
        out.status = 'Warning';
        out.details.push('An error occurred while adding the user as a contributor: ' + e.toString());

        return out;
    }

    return out;
}

/**
 * Handle the Zotero API call
 * @param data {object} form POST data
 * @return {Promise<{details: Array, title: string, status: string}>} a formatted response report
 */
async function callZotero(data) {
    const out = {
        title: 'Zotero',
        status: 'Okay',
        details: [],
        zoteroCollectionId: null
    };

    const url = 'https://api.zotero.org/groups/2354006';

    // Check for existing Zotero collection
    try {
        const call = await fetch(`${url}/collections`,
            {
                headers: {
                    'Zotero-API-Version': '3'
                }
            });
        if(!call.ok) {
            throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        }

        const response = await call.json();

        if(response.length) {
            for(const r of response) {
                if(r.data.name === data.name) {
                    out.status = 'Warning';
                    out.details.push('A Zotero collection with a similar name already exists; another will not be created.');

                    return out;
                }
            }
        }
    } catch(e) {
        out.status = 'Error';
        out.details.push('An error occurred: ' + e.toString());

        return out;
    }

    // Add new Zotero collection
    const addCollection = JSON.stringify([{
        name: data.name,
        parentCollection: false
    }]);

    try {
        const call = await fetch(`${url}/collections`,
            {
                method: 'POST',
                headers: {
                    'Zotero-API-Version': '3',
                    Authorization: `Bearer ${ZOTERO_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Content-Length': addCollection.length
                },
                body: addCollection
            });
        if(!call.ok) {
            throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        }

        const response = await call.json();

        if(response.success && response.success[0] && response.success[0].length) {
            out.zoteroCollectionId = response.success[0];
            out.details.push(`Created new Zotero collection at <a href="https://www.zotero.org/groups/2354006/reproducibilitea/items/collectionKey/${out.zoteroCollectionId}" target="_blank">https://www.zotero.org/groups/2354006/reproducibilitea/items/collectionKey/${out.zoteroCollectionId}</a>.`);
        } else {
            out.status = 'Error';
            out.details.push('Unable to create Zotero collection.');

            return out;
        }
    } catch(e) {
        out.status = 'Error';
        out.details.push('An error occurred while creating the collection: ' + e.toString());

        return out;
    }

    // Add the JC lead as a member of the Zotero group
    if(!data.zoteroUser || !data.zoteroUser.length) {
        return out;
    }

    // Get current members
    let members = [];
    try {
        const call = await fetch(url,
            {
                headers: {
                    'Zotero-API-Version': '3'
                }
            });
        if(!call.ok) {
            throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        }

        const response = await call.json();

        if(!response.data || !response.data.members) {
            out.status = 'Warning';
            out.details.push('Unable to add user as a Zotero group member.');

            return out;
        } else {
            members = [...response.data.members, data.zoteroUser];
        }
    } catch(e) {
        out.status = 'Error';
        out.details.push('An error occurred while adding the user to the group: ' + e.toString());

        return out;
    }

    const updateMembers = JSON.stringify([{members}]);

    // Update the members field
    try {
        const call = await fetch(url,
            {
                method: 'PATCH',
                headers: {
                    'Zotero-API-Version': '3',
                    Authorization: `Bearer ${ZOTERO_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Content-Length': updateMembers.length
                },
                body: updateMembers
            });
        if(!call.ok) {
            throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        }

        await call.json();

        out.details.push('Added the user to the Zotero group.');

    } catch(e) {
        out.status = 'Warning';
        out.details.push('An error occurred while adding the user as a group member: ' + e.toString());

        return out;
    }

    return out;
}

/**
 * Handle the lack of a Slack API call
 * @param data {object} from POST data
 * @return {Promise<{details: string[], title: string, status: string}>}
 */
async function callSlack(data) {
    return {
        title: 'Slack',
        status: 'Warning',
        details: [
            `We are currently unable to automate Slack invites. Please join the workspace using the direct link: <a href="${SLACK_LINK}" target="_blank">${SLACK_LINK}</a>`
        ]
    }
}

/**
 * Handle the GitHub API call
 * @param data {object} form POST data
 * @param results {object} response reports from previous API calls
 * @param editToken {object|null} token containing edit authorisation details
 * @return {Promise<{details: Array, title: string, status: string}>} a formatted response report
 */
async function callGitHub(data, results, editToken = null) {

    const out = {
        title: 'GitHub',
        status: 'Okay',
        details: []
    };

    const url = 'https://api.github.com/repos/mjaquiery/reproducibiliTea/contents/_journal-clubs';

    // Check whether a JC file already exists
    try {
        const call = await fetch(url,
            {
                headers: {
                    'User-Agent': 'mjaquiery'
                }
            });
        if(!call.ok) {
            throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        }

        const response = await call.json();

        if(!response) {
            out.status = 'Error';
            out.details.push('Unable to fetch existing JC list.');
            return out;
        }

        for(const jc of response) {
            if(jc.name === `${data.jcid}.md`) {
                if(editToken) {
                    // Look up previous file for details like osf repo, zotero library, etc.
                    // Also get the sha1 because we'll need it later
                    await fetch(`${url}/${encodeURI(jc.name)}`, {
                        headers: {
                            'User-Agent': 'mjaquiery',
                            Authorization: `token ${GITHUB_TOKEN}`
                        }
                    })
                        .then(r => {
                            if(r.status === 200)
                                return r.json()
                            else
                                throw new Error(`Could not lookup existing JC: ${r.statusText} (${r.status})`)
                        })
                        .then(async f => {
                            const buff = new Buffer.from(f.content, 'base64');
                            const body = buff.toString();
                            // Hack out the bits of the results we need
                            const osf = /^osf: (.*)$/m.exec(body);
                            const zotero = /^zotero: (.*)$/m.exec(body);
                            results = {
                                osf: {osfRepoId: osf? osf[1] : null},
                                zotero: {zoteroCollectionId: zotero? zotero[1] : null},
                                sha: f.sha
                            };
                        });
                    break;
                } else {
                    out.status = 'Warning';
                    out.details.push(`${data.jcid}.md already exists: a new version will not be created.`);

                    return out;
                }
            }
        }

    } catch(e) {
        out.status = 'Warning';
        out.details.push('An error occurred while accessing the repository. ' + e.toString());

        return out;
    }

    out.githubFile = `---

jcid: ${data.jcid}
title: ${data.name}
host-organisation: ${data.uni}
host-org-url: ${data.uniWWW}
osf: ${results.osf.osfRepoId}
zotero: ${results.zotero.zoteroCollectionId}
website: ${data.www}
twitter: ${data.twitter}
signup: ${data.signup}
organisers: [${[data.lead, ...data.helpers].join(', ')}]
contact: ${data.email}
additional-contact: [${data.emails.join(', ')}]
address: [${data.post}]
country: ${data.country}
geolocation: [${data.geolocation[0]}, ${data.geolocation[1]}]
last-update: ${editToken.email}
last-update-message: ${editToken.message}
---

${data.description}
`;

    console.log({gitHubFile: out.githubFile})

    // Create github file
    const content = editToken?
        JSON.stringify({
        message: `Form update of ${data.jcid}.md by ${editToken.email}.  
${editToken.message}`,
        content: new Buffer.from(out.githubFile).toString('base64'),
        sha: results.sha
    }) :
        JSON.stringify({
            message: `API creation of ${data.jcid}.md`,
            content: new Buffer.from(out.githubFile).toString('base64')
        });

    try {
        const call = await fetch(`${url}/${data.jcid}.md`,
            {
                method: 'PUT',
                headers: {
                    'User-Agent': 'mjaquiery',
                    Authorization: `token ${GITHUB_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Content-Length': content.length
                },
                body: content
            });
        if(!call.ok) {
            throw new Error(`Server response: ${call.status}: ${call.statusText}`);
        }

        await call.json();

        if(editToken)
            out.details.push(`Updated ${data.jcid}.md. The new details will be available shortly at <a href="https://reproducibiliTea.org/journal-clubs/#${encodeURI(data.name)}" target="_blank">https://reproducibiliTea.org/journal-clubs/#${encodeURI(data.name)}</a>`);
        else
            out.details.push(`Created ${data.jcid}.md. Journal club webpage will be available shortly at <a href="https://reproducibiliTea.org/journal-clubs/#${encodeURI(data.name)}" target="_blank">https://reproducibiliTea.org/journal-clubs/#${encodeURI(data.name)}</a>`);

    } catch(e) {
        out.status = 'Warning';
        out.details.push('An error occurred while creating JC.md file: ' + e.toString());

        return out;
    }

    return out;
}

/**
 * Handle the Mailgun API call
 * @param data {object} form POST data
 * @param results {object} response reports from previous API calls
 * @return {Promise<{details: Array, title: string, status: string}>} a formatted response report
 */
async function callMailgun(data, results) {
    const out = {
        title: 'Mailgun',
        status: 'Okay',
        details: []
    };

    // Load mailgun
    const mailgun = require('mailgun-js')({
        apiKey: MAILGUN_API_KEY,
        domain: MAILGUN_DOMAIN,
        host: MAILGUN_HOST
    });

    const mailgunData = {
        from: FROM_EMAIL_ADDRESS,
        to: EMAIL_REPORT_TO,
        'h:Reply-To': FROM_EMAIL_ADDRESS,
        subject: `New ReproducibiliTea: ${data.name}`,
        html: `
<style type="text/css">
    .status {font-weight: bold;color: darkgoldenrod;}
    .status.okay {color: #009926;}
    .status.error {color: #990000;}
    ul {list-style: none;}
    .okay {background-color: #d7eefd;}
    .warning {background-color: #ffe8d4;}
    .error {background-color: #ff253a;font-weight: bold;}
    li {padding: .25em;}
    .detail li {padding: .25em}
    .okay h2:before {content: "\\2705";}
    .warning h2:before {content: "\\26A0";}
    .error h2:before {content: "\\274C";}
</style>
<p>A new ReproducibiliTea journal club has been created: <strong>${data.name}</strong>!</p>
<h1>JC creation report</h1>
${formatResponses(results)}
<p>Welcome to the new JC organisers!</p>
<img alt="Netlify Status" src="https://api.netlify.com/api/v1/badges/73c3eba3-53fc-4a64-ad95-d15c930a02c7/deploy-status"/>
<hr />
<h1>Technical details</h1>
<h2>Form contents</h2>
${JSON.stringify(data)}
<h2>Generated JC.md file</h2>
${results.github.githubFile.replace(/\\n/g, '\n<br />')}
        `
    };

    await mailgun.messages().send(mailgunData).then(() => {
        out.details.push('Successfully sent email to ReproducibiliTea.');
    }).catch(error => {
        out.status = 'Error';
        out.details.push(`Failed to send email to ReproducibiliTea. ${error}`);
    });

    return out;
}

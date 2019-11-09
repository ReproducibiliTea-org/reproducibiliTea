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
    MAILGUN_URL,
    FROM_EMAIL_ADDRESS,
    CONTACT_TO_EMAIL_ADDRESS
} = process.env;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed', headers: { 'Allow': 'POST' } }
    }

    const data = cleanData(JSON.parse(event.body));

    const check = checkData(data);

    if (check !== null) {
        return check;
    }

    const test = await callZotero(data)
    return {statusCode: 200, body: formatResponses({zotero: test})}

    // From here we continue regardless of success, we just record the success/failure status of the series of API calls
    const body = await callAPIs(data);

    return {statusCode: 200, body: formatResponses(body)};
};

/**
 * Clean the incoming data
 * @param data {object} POST data in request
 * @return {object} cleaned POST data
 */
function cleanData(data) {
    if(data.jcid)
        data.jcid = data.jcid.toLowerCase();

    // Remove the unnecessary bits of the OSF user input
    if(data.osfUser && data.osfUser.length) {
        const match = /^(?:https?:\/\/osf.io\/)?([0-9a-z]+)\/?$/i
            .exec(data.osfUser);
        if(match)
            data.osfUser = match[1];
    }

    // Concatenate helper list into array
    data.helpers = [];
    for(let i = 0; data.hasOwnProperty('helper' + i.toString()); i++)
        data.helpers.push(data['helper' + i.toString()]);

    return data;
}

/**
 * Check the request for hygiene, completeness, and sanity
 * @param data {object} POST data in request
 * @return {object|null} a http response on error or null if okay
 */
function checkData(data) {
    const fail = (s, c = 400) => ({
        statusCode: c, body: s
    });

    const requiredFields = [
        'jcid', 'name', 'uni', 'uniWWW', 'email', 'post',
        'country', 'lead', 'authCode'
    ];

    for(const x of requiredFields) {
        if(!data.hasOwnProperty(x))
            return fail(`The request is missing mandatory field \'${x}\'.`)
    }

    if(!/^[a-z0-9]+$/i.test(data.jcid))
        return fail('The id field contains invalid characters.');

    if(!/^[a-z0-9]+$/i.test(data.osfUser))
        return fail('The OSF username contains invalid characters.');

    // check email has an x@y structure
    if(!/\S+@\S+/i.test(data.email))
        return fail('The email address supplied appears invalid.');

    if(data.authCode !== AUTH_CODE) {
        return fail('The authorisation code supplied is invalid.')
    }

    return null;
}


async function callAPIs(data) {
    const [osf, zotero] = await Promise.all([
        callOSF(data),
        callZotero(data)
    ]);

    // Some API calls require info we only have after others are made...
    const github = await callGitHub(data, {osf, zotero});
    const mailgun = await callMailgun(data, {osf, zotero, github});

    return {osf, zotero, github, mailgun};
}

/**
 * Format a set of responses from API calls
 * @param re {object} dictionary of response objects
 * @return {string} HTML response body
 */
function formatResponses(re) {
    console.log(re)

    let out = "";

    for(const s in re) {
        if(!re.hasOwnProperty(s))
            continue;

        const r = re[s];

        out += `
<h2>${r.title}</h2>
<p><strong>Status:</strong> ${r.status}</p>
`;
        out += '<ul>';
        for(const task of r.details)
            out += `<li>${task}</li>`;
        out += '</ul>';
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

    const osfURL = 'https://api.test.osf.io/v2/';

    // Check for existing OSF repository
    try {
        const call = await fetch(`${osfURL}nodes/384cb/children/?filter[title]=${encodeURI(data.name)}`,
            {
                headers: {
                    Authorization: `Bearer ${OSF_TOKEN}`
                }
            });
        if(!call.ok) {
            throw new Error(`Server response: ${call.status}: ${call.statusCode}`);
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
                category: 'other',
                description: `Materials from ReproducibiliTea sessions in ${data.name}. Templates and presentations are available for others to use and edit.`,
                'public': '1'
            }
        }
    };

    try {
        const call = await fetch(`${osfURL}nodes/384cb/children/`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${OSF_TOKEN}`,
                    'Content-Type': 'application/vnd.api+json'
                },
                body: JSON.stringify(makeJC)
            });
        if(!call.ok) {
            throw new Error(`Server response: ${call.status}: ${call.statusCode}`);
        }

        const response = await call.json();

        if(!response.data || !response.data.id) {
            out.status = 'Error';
            out.details.push('Unable to create OSF repository.');

            return out;
        } else {
            out.details.push(`Created new OSF repository at <a href="https://osf.io/${response.data.id}">https://osf.io/${response.data.id}</a>.`);
            out.osfRepoId = response.data.id;
        }
    } catch(e) {
        out.status = 'Error';
        out.details.push('An error occurred while creating the repository: ' + e.toString());

        return out;
    }

    // Add the JC lead as a contributor to the OSF repository
    if(!data.osfUser || !data.osfUser.length) {
        return out;
    }

    const addUser = {
        data: {
            type: 'contributors',
            attributes: "",
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
            throw new Error(`Server response: ${call.status}: ${call.statusCode}`);
        }

        const response = await call.json();

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
            throw new Error(`Server response: ${call.status}: ${call.statusCode}`);
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
            throw new Error(`Server response: ${call.status}: ${call.statusCode}`);
        }

        const response = await call.json();
        console.log(response)

        if(response.success && response.success.length) {
            out.zoteroCollectionId = response.success[0];
            out.details.push(`Created new Zotero collection at <a href="https://osf.io/${out.zoteroCollectionId}">https://osf.io/${out.zoteroCollectionId}</a>.`);
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
            throw new Error(`Server response: ${call.status}: ${call.statusCode}`);
        }

        const response = await call.json();
        console.log(response)

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

    const updateMembers = JSON.stringify({members});

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
            throw new Error(`Server response: ${call.status}: ${call.statusCode}`);
        }

        const response = await call.json();
        console.log(response)

        out.details.push('Added the user to the Zotero group.');

    } catch(e) {
        out.status = 'Warning';
        out.details.push('An error occurred while adding the user as a group member: ' + e.toString());

        return out;
    }

    return out;
}

/**
 * Handle the GitHub API call
 * @param data {object} form POST data
 * @param results {object} response reports from previous API calls
 * @return {Promise<{details: Array, title: string, status: string}>} a formatted response report
 */
async function callGitHub(data, results) {
    const out = {
        title: 'GitHub',
        status: 'Okay',
        details: []
    };
    await fetch();
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
    const mailgun = require('mailgun-js')({ apiKey: MAILGUN_API_KEY, domain: MAILGUN_DOMAIN, url: MAILGUN_URL });

    const mailgunData = {
        from: FROM_EMAIL_ADDRESS,
        to: CONTACT_TO_EMAIL_ADDRESS,
        'h:Reply-To': data.contactEmail,
        subject: `New contact from ${data.contactName}`,
        text: `Name: ${data.contactName}\nEmail: ${data.contactEmail}\nMessage: ${data.message}`
    };

    await mailgun.messages().send(mailgunData).then(() => {
        out.details.push('Successfully sent email to ReproducibiliTea.');
    }).catch(error => {
        out.status = 'Failed';
        out.details.push('Failed to send email to ReproducibiliTea.');
    });

    return out;
}

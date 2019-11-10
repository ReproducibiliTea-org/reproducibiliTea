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
    FROM_EMAIL_ADDRESS
} = process.env;


const OPTIONAL_FIELDS = [
    'www', 'twitter', 'description', 'osfUser', 'zoteroUser',
    'signup', 'uniWWW',
];

const REQUIRED_FIELDS = [
    'jcid', 'name', 'uni', 'email', 'post',
    'country', 'lead', 'authCode'
];

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed', headers: { 'Allow': 'POST' } }
    }

    let data = {};

    try{
        data = cleanData(JSON.parse(event.body));
        console.log(data)
    } catch(e) {
        return {
            statusCode: 400,
            body: '<p>Could not clean submission for processing</p>'
        };
    }


    const check = checkData(data);

    if (check !== null) {
        return check;
    }

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
    // ensure the whole form has at least empty strings
    // mandatory fields are checked later
    for(const s of OPTIONAL_FIELDS) {
        if(!data.hasOwnProperty(s))
            data[s] = "";
    }

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
        if(data['helper' +i.toString()].length)
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
        return fail(`The id field ("${data.jcid}")  contains invalid characters.`);

    if(!/^[a-z0-9]*$/i.test(data.osfUser))
        return fail(`The OSF username ("${data.osfUser}")  contains invalid characters.`);

    // check email has an x@y structure
    if(!/\S+@\S+/i.test(data.email))
        return fail(`The email address supplied("${data.email}")   appears invalid.`);

    if(data.authCode !== AUTH_CODE) {
        return fail(`The authorisation code supplied("${data.authCode}") is invalid. It should be ${AUTH_CODE}`)
    }

    return null;
}


async function callAPIs(data) {
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
    console.log(re)

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
        console.log(response)

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

        if(response.success && response.success[0] && response.success[0].length) {
            out.zoteroCollectionId = response.success[0];
            out.details.push(`Created new Zotero collection at <a href="https://www.zotero.org/groups/2354006/reproducibilitea/items/collectionKey/${out.zoteroCollectionId}">https://www.zotero.org/groups/2354006/reproducibilitea/items/collectionKey/${out.zoteroCollectionId}</a>.`);
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
 * Handle the lack of a Slack API call
 * @param data {object} from POST data
 * @return {Promise<{details: string[], title: string, status: string}>}
 */
async function callSlack(data) {
    return {
        title: 'Slack',
        status: 'Warning',
        details: [
            `We are currently unable to automate Slack invites. Please join the workspace using the direct link: <a href="${SLACK_LINK}">${SLACK_LINK}</a>`
        ]
    }
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
        details: [],
        githubFile: `
---
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
address: ${data.post}
country: ${data.country}
---

${data.description}
`
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
            throw new Error(`Server response: ${call.status}: ${call.statusCode}`);
        }

        const response = await call.json();

        if(!response) {
            out.status = 'Error';
            out.details.push('Unable to fetch existing JC list.');
            return out;
        }

        for(const jc of response) {
            if(jc.name === `${data.jcid}.md`) {
                out.status = 'Warning';
                out.details.push(`${data.jcid}.md already exists: a new version will not be created.`);

                return out;
            }
        }

    } catch(e) {
        out.status = 'Warning';
        out.details.push('An error occurred while accessing the repository. ' + e.toString());

        return out;
    }

    // Create github file
    const content = JSON.stringify({
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
            throw new Error(`Server response: ${call.status}: ${call.statusCode}`);
        }

        const response = await call.json();

        out.details.push(`Created ${data.jcid}.md. Journal club webpage will be available shortly at <a href="https://reproducibiliTea.org/journal-clubs/#${encodeURI(data.name)}">https://reproducibiliTea.org/journal-clubs/#${encodeURI(data.name)}</a>`);

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
        url: MAILGUN_URL
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
</hr>
<h1>Technical details</h1>
<h2>Form contents</h2>
${JSON.stringify(data)}
<h2>Generated JC.md file</h2>
${results.github.githubFile}
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

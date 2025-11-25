// node fetch support
require('dotenv').config();
const { MongoClient } = require('mongodb');

const { MONGODB_URI, MONGODB_DB } = process.env;

let {GITHUB_REPO_API} = process.env;

exports.handler = function(event, context, callback) {
    // Switch to Sandbox mode if we're on the sandbox account
    if(/(sandbox|localhost)/.test(event.headers.referer) ||
        event.headers.sandbox === 'true') {
        const {GITHUB_REPO_API_SANDBOX} = process.env;

        GITHUB_REPO_API = GITHUB_REPO_API_SANDBOX;
    }

    // Check input
    console.log("event.body", event.body)
    const data = JSON.parse(event.body);
    if(!data.token) {
        return callback('Authorisation token must be specified in JSON format in the request body.');
    }
    console.log("Checking token", data.token)

    /**
     * Establish a MongoDB connection
     */
    async function getDatabase() {
        try {
            if(!MONGODB_URI || !MONGODB_DB) {
                const missing = !MONGODB_URI? 'MONGODB_URI' : 'MONGODB_DB';
                const dbError = new Error(`Database connection failed: environment variable ${missing} is not configured.`);
                dbError.isDbConnection = true;
                throw dbError;
            }
            const mongo = new MongoClient(MONGODB_URI);
            await mongo.connect();
            return { client: mongo, collection: mongo.db(MONGODB_DB).collection('editTokens') };
        } catch (error) {
            const dbError = new Error(`Database connection failed: ${error.message}`);
            dbError.isDbConnection = true;
            throw dbError;
        }
    }

    let mongoConnection;

    getDatabase()
        .then(connection => {
            mongoConnection = connection;
            const { collection } = mongoConnection;
            return collection.findOne({ token: data.token });
        })
        .then(doc => {
            if(!doc)
                throw new Error('No matching token found.');
            if(!doc.expires || doc.expires < new Date())
                throw new Error('The token has expired.');
            return callback(null, {
                statusCode: 200,
                body: JSON.stringify(doc)
            });
        })
        .catch(e => {
            if(e.isDbConnection)
                callback(e.message);
            else
                callback(e);
        })
        .finally(() => {
            if(mongoConnection?.client)
                mongoConnection.client.close();
        });
};

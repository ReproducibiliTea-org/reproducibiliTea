'use strict';

const Diacritics = require('diacritic');

const OPTIONAL_FIELDS = [
    'www', 'twitter', 'description', 'zoteroUser',
    'signup', 'uniWWW', 'osf'
];

const REQUIRED_FIELDS = [
    'jcid', 'name', 'uni', 'email', 'post',
    'country', 'lead', 'geolocation'
];

/**
 * Clean the incoming data
 * @param data {object} POST data in request
 * @return {object} cleaned POST data
 */
function cleanData(data) {
    for (const s of OPTIONAL_FIELDS) {
        if (!data.hasOwnProperty(s)) data[s] = "";
    }

    if (data.post) {
        data.post = data.post.replace(/,\s*/g, '\n');
        data.post = data.post.replace(/[\n\r]\r?/g, ', ');
        data.post = data.post.replace(/ {2,}/sg, ' ');
    }

    if (data.jcid) {
        data.jcid = Diacritics.clean(data.jcid.toLowerCase());
    }

    for (const x in data) {
        if (typeof data[x] !== "string") continue;
        data[x] = data[x].trim();
    }

    if (data.osf && data.osf.length) {
        const match = /^(?:https?:\/\/osf.io\/)?([0-9a-z]+)\/?$/i.exec(data.osf);
        if (match) data.osf = match[1];
    }

    data.helpers = [];
    for (let i = 0; data.hasOwnProperty('helper' + i.toString()); i++) {
        if (data['helper' + i.toString()].length) data.helpers.push(data['helper' + i.toString()]);
    }

    data.emails = [];
    for (let i = 0; data.hasOwnProperty('extraEmail' + i.toString()); i++) {
        if (data['extraEmail' + i.toString()].length) data.emails.push(data['extraEmail' + i.toString()]);
    }

    if (data.twitter) {
        while (data.twitter[0] === "@") data.twitter = data.twitter.substr(1);
    }

    if (data.geolocation) {
        const d = Array.isArray(data.geolocation) ? data.geolocation : data.geolocation.split(',');
        data.geolocation = d.map(a => parseFloat(a));
    }

    return data;
}

/**
 * Check the request for hygiene, completeness, and sanity
 * @param data {object} cleaned POST data
 * @return {string|null} the first validation error, or null if the data is valid
 */
function checkData(data) {
    for (const x of REQUIRED_FIELDS) {
        if (!data.hasOwnProperty(x)) return `The request is missing mandatory field '${x}'.`;
    }

    if (!/^[a-z0-9\-]+$/i.test(data.jcid)) {
        return `The id field ("${data.jcid}") contains invalid characters.`;
    }
    if (!/^[a-z0-9]*$/i.test(data.osf || '')) {
        return `The OSF repository ("${data.osf}") contains invalid characters.`;
    }
    if (!/^[0-9]*$/i.test(data.zoteroUser || '')) {
        return `The Zotero username ("${data.zoteroUser}") contains invalid characters.`;
    }
    if (!/\S+@\S+/i.test(data.email)) {
        return `The email address supplied("${data.email}") appears invalid.`;
    }
    for (const e of data.emails || []) {
        if (!/\S+@\S+/i.test(e)) return `The email address supplied("${e}") appears invalid.`;
    }
    if (!data.geolocation || data.geolocation.length !== 2 || !data.geolocation.every(isFinite)) {
        return "The geolocation data is not in the correct format.";
    }
    return null;
}

/**
 * Creation-only limits. These bound the length of the signed confirm-token URL,
 * so they apply to new submissions but NOT to edits of existing journal clubs
 * (13 live entries have descriptions over 1000 characters).
 * @param data {object} cleaned POST data
 * @return {string|null} the first validation error, or null if the data is valid
 */
function checkCreationLimits(data) {
    if ((data.description || '').length > 1000) {
        return "The description is too long (max 1000 characters).";
    }
    if ((data.post || '').length > 500) {
        return "The address is too long (max 500 characters).";
    }

    return null;
}

module.exports = { cleanData, checkData, checkCreationLimits };

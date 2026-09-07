'use strict';

const crypto = require('crypto');

function sign(payloadPart, secret) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('token secret is not configured');
  }
  return crypto.createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

/**
 * @param {object} payload - caller-defined fields to embed in the token
 * @param {string} secret
 * @param {{ expiresInMs?: number }} [opts]
 * @return {string} `${base64url(payload)}.${base64url(signature)}`
 */
function signToken(payload, secret, opts = {}) {
  const body = { ...payload };
  if (typeof opts.expiresInMs === 'number') {
    body.expires = Date.now() + opts.expiresInMs;
  }
  const payloadPart = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  return `${payloadPart}.${sign(payloadPart, secret)}`;
}

/**
 * @param {string} token
 * @param {string} secret
 * @return {{valid: true, payload: object} | {valid: false, reason: string}}
 */
function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'malformed' };
  }
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) {
    return { valid: false, reason: 'malformed' };
  }

  const expectedSignature = sign(payloadPart, secret);
  const provided = Buffer.from(signaturePart);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { valid: false, reason: 'bad_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch (e) {
    return { valid: false, reason: 'malformed_payload' };
  }

  if (typeof payload.expires === 'number' && Date.now() > payload.expires) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, payload };
}

module.exports = { signToken, verifyToken };

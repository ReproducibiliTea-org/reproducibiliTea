'use strict';

/**
 * Escape a string for safe interpolation into HTML text or an attribute value.
 * @param {*} s
 * @return {string}
 */
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { escapeHtml };

const crypto = require("crypto");

const API_KEY = process.env.LASTFM_API_KEY;
const SHARED_SECRET = process.env.LASTFM_SHARED_SECRET;

/**
 * Generates what Last.fm calls an "api_sig" (MD5 signature).
 * Reference: https://www.last.fm/api/desktopauth#6
 * 
 * Rules:
 * 1. Sort all parameters alphabetically by name.
 * 2. Concatenate name + value (no '=' or '&').
 * 3. Append secret.
 * 4. MD5 hash the result.
 * 
 * @param {Object} params - The query parameters to sign (excluding format, callback, etc if they are not part of signature, usually all params sent).
 * @returns {string} The MD5 signature.
 */
function createSignature(params) {
    const keys = Object.keys(params).sort();
    let sig = "";
    
    for (const key of keys) {
        if (key === "format" || key === "callback") continue; // Usually excluded, but check docs. 'format' is NOT signed in some contexts but IS in others. 
        // Docs say: "Constructed by sorting all the parameters sent to the method... excluding the format and callback parameters"
        sig += key + params[key];
    }
    
    sig += SHARED_SECRET;
    
    return crypto.createHash("md5").update(sig).digest("hex");
}

/**
 * Helper to get a signed URL or Request Body params.
 * @param {Object} params 
 */
function signParams(params) {
    const p = { ...params, api_key: API_KEY };
    p.api_sig = createSignature(p);
    return p;
}

module.exports = { createSignature, signParams, API_KEY };

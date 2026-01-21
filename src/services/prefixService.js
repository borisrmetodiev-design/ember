const fs = require('fs');
const path = require('path');

const prefixesPath = path.join(__dirname, '../storage/data/prefixes.json');

// Memory cache
let prefixCache = null;

// Ensure the file exists
if (!fs.existsSync(prefixesPath)) {
    if (!fs.existsSync(path.dirname(prefixesPath))) {
        fs.mkdirSync(path.dirname(prefixesPath), { recursive: true });
    }
    fs.writeFileSync(prefixesPath, JSON.stringify({}));
}

function loadPrefixes() {
    try {
        const data = fs.readFileSync(prefixesPath, 'utf8');
        prefixCache = JSON.parse(data);
        return prefixCache;
    } catch (err) {
        console.error('Error reading prefixes.json:', err);
        prefixCache = {};
        return {};
    }
}

function getPrefixes() {
    if (prefixCache) return prefixCache;
    return loadPrefixes();
}

function setPrefix(guildId, prefix) {
    const prefixes = getPrefixes();
    prefixes[guildId] = prefix;
    prefixCache = prefixes; // Update cache
    
    try {
        // Use async for writing if possible, but keep sync for now to match style, 
        // but it's only called on command so it's fine.
        fs.writeFileSync(prefixesPath, JSON.stringify(prefixes, null, 2));
    } catch (err) {
        console.error('Error writing prefixes.json:', err);
    }
}

function getPrefix(guildId, defaultPrefix) {
    const prefixes = getPrefixes();
    return prefixes[guildId] || defaultPrefix;
}

module.exports = {
    getPrefix,
    setPrefix
};

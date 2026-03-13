const fs = require('fs');
const path = require('path');

const timezonesPath = path.join(__dirname, '../storage/data/timezones.json');

// Memory cache
let timezoneCache = null;

// Ensure the file exists
if (!fs.existsSync(timezonesPath)) {
    if (!fs.existsSync(path.dirname(timezonesPath))) {
        fs.mkdirSync(path.dirname(timezonesPath), { recursive: true });
    }
    fs.writeFileSync(timezonesPath, JSON.stringify({}));
}

function loadTimezones() {
    try {
        const data = fs.readFileSync(timezonesPath, 'utf8');
        timezoneCache = JSON.parse(data);
        return timezoneCache;
    } catch (err) {
        console.error('Error reading timezones.json:', err);
        timezoneCache = {};
        return {};
    }
}

function getTimezones() {
    if (timezoneCache) return timezoneCache;
    return loadTimezones();
}

function setUserTimezone(userId, timezone) {
    const timezones = getTimezones();
    timezones[userId] = timezone;
    timezoneCache = timezones; // Update cache
    
    try {
        fs.writeFileSync(timezonesPath, JSON.stringify(timezones, null, 2));
    } catch (err) {
        console.error('Error writing timezones.json:', err);
    }
}

function getUserTimezone(userId) {
    const timezones = getTimezones();
    return timezones[userId] || null;
}

module.exports = {
    getUserTimezone,
    setUserTimezone
};

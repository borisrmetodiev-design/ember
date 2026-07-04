// Music formatters — shared across commands and embeds

/**
 * Format milliseconds to MM:SS or HH:MM:SS
 * @param {number} ms - duration in milliseconds
 * @returns {string}
 */
function formatDuration(ms) {
    if (!ms || isNaN(ms)) return "0:00";
    const totalSecs = Math.floor(ms / 1000);
    return formatSeconds(totalSecs);
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 * @param {number} seconds
 * @returns {string}
 */
function formatSeconds(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Parse a time string (e.g. "1:30", "90", "1:30:00") into seconds
 * @param {string} input
 * @returns {number} seconds, or -1 if invalid
 */
function parseTimeInput(input) {
    if (!input) return -1;
    input = input.trim();

    // Pure number = seconds
    if (/^\d+$/.test(input)) return parseInt(input);

    // MM:SS or HH:MM:SS
    const parts = input.split(":").map(Number);
    if (parts.some(isNaN)) return -1;

    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];

    return -1;
}

/**
 * Truncate a string to a max length, appending ellipsis if needed
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen = 50) {
    if (!str) return "";
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + "...";
}

/**
 * Format a number with commas
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
    return Number(n).toLocaleString();
}

/**
 * Get a human-readable relative time label (e.g. "now", "in 2 tracks")
 * @param {number} position - 0-based index in queue
 * @returns {string}
 */
function queuePosition(position) {
    if (position === 0) return "Up next";
    if (position === 1) return "In 2 tracks";
    return `In ${position + 1} tracks`;
}

module.exports = {
    formatDuration,
    formatSeconds,
    parseTimeInput,
    truncate,
    formatNumber,
    queuePosition,
};

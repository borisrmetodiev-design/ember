// Progress bar generator for music embeds

const { LIMITS } = require("./constants");

/**
 * Build an ASCII progress bar
 * @param {number} elapsed  - elapsed seconds
 * @param {number} total    - total duration seconds
 * @param {number} width    - bar width in characters (default from constants)
 * @returns {string}        e.g. "▬▬▬▬●────────────"
 */
function buildProgressBar(elapsed, total, width = LIMITS.PROGRESS_BAR_WIDTH) {
    if (!total || total <= 0 || isNaN(total)) {
        // Livestream / unknown duration — show indeterminate bar
        return "▬".repeat(width) + " 🔴 LIVE";
    }

    elapsed = Math.max(0, Math.min(elapsed, total));
    const progress = elapsed / total;
    const filled = Math.round(progress * width);
    const empty = width - filled;

    const bar = "▬".repeat(Math.max(0, filled - 1)) +
                "●" +
                "─".repeat(Math.max(0, empty));

    return bar;
}

/**
 * Build a compact percentage bar (e.g. for volume display)
 * @param {number} value   - 0 to 100
 * @param {number} width   - total characters
 * @returns {string}
 */
function buildVolumeBar(value, width = 10) {
    value = Math.max(0, Math.min(100, value));
    const filled = Math.round((value / 100) * width);
    const empty = width - filled;
    return "█".repeat(filled) + "░".repeat(empty);
}

module.exports = { buildProgressBar, buildVolumeBar };

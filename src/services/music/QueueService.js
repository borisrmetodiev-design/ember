// QueueService — per-guild queue state management
// Each guild gets its own isolated GuildQueue object

const { LIMITS, LOOP_MODES } = require("../../utils/music/constants");

/**
 * Create a fresh GuildQueue state object.
 */
function createQueue(overrides = {}) {
    return {
        tracks:          [],     // upcoming Track[]
        history:         [],     // recently played Track[]
        current:         null,   // currently playing Track
        loop:            LOOP_MODES.NONE,
        volume:          LIMITS.DEFAULT_VOLUME,
        autoplay:        false,
        paused:          false,
        textChannel:     null,
        voiceChannel:    null,
        nowPlayingMsg:   null,   // Message object for live-updating np embed
        updateInterval:  null,   // setInterval handle
        startedAt:       null,   // Date.now() when current track started
        seekOffset:      0,      // seek offset in seconds
        ...overrides,
    };
}

// In-memory store: guildId → GuildQueue
const queues = new Map();

// ─── Queue lifecycle ──────────────────────────────────────────────────────────

/**
 * Get or create a queue for a guild.
 */
function getOrCreate(guildId, overrides = {}) {
    if (!queues.has(guildId)) {
        queues.set(guildId, createQueue(overrides));
    }
    return queues.get(guildId);
}

/**
 * Get a queue (returns null if not exists).
 */
function get(guildId) {
    return queues.get(guildId) || null;
}

/**
 * Destroy and remove a guild's queue.
 */
function destroy(guildId) {
    const queue = queues.get(guildId);
    if (queue?.updateInterval) {
        clearInterval(queue.updateInterval);
    }
    queues.delete(guildId);
}

// ─── Track management ─────────────────────────────────────────────────────────

/**
 * Add one or more tracks to the end of the queue.
 * @param {string} guildId
 * @param {Track|Track[]} tracks
 * @returns {GuildQueue}
 */
function add(guildId, tracks) {
    const queue = get(guildId);
    if (!queue) return null;

    const toAdd = Array.isArray(tracks) ? tracks : [tracks];
    const capped = toAdd.slice(0, LIMITS.MAX_QUEUE_LENGTH - queue.tracks.length);
    queue.tracks.push(...capped);
    return queue;
}

/**
 * Remove a track at a 1-based position.
 * @param {string} guildId
 * @param {number} position - 1-based
 * @returns {Track|null} removed track
 */
function remove(guildId, position) {
    const queue = get(guildId);
    if (!queue) return null;

    const idx = position - 1;
    if (idx < 0 || idx >= queue.tracks.length) return null;

    const [removed] = queue.tracks.splice(idx, 1);
    return removed;
}

/**
 * Clear all upcoming tracks (keep current).
 */
function clear(guildId) {
    const queue = get(guildId);
    if (!queue) return;
    queue.tracks = [];
}

/**
 * Shuffle upcoming tracks using Fisher-Yates.
 */
function shuffle(guildId) {
    const queue = get(guildId);
    if (!queue || queue.tracks.length === 0) return;

    for (let i = queue.tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
    }
}

/**
 * Move the queue position to a specific 1-based index (jump/skip to).
 * Removes all tracks before that index.
 * @param {string} guildId
 * @param {number} position - 1-based index in the upcoming queue
 * @returns {Track|null} the track that will now play
 */
function jump(guildId, position) {
    const queue = get(guildId);
    if (!queue) return null;

    const idx = position - 1;
    if (idx < 0 || idx >= queue.tracks.length) return null;

    // Remove all tracks before idx
    queue.tracks.splice(0, idx);
    return queue.tracks[0] || null;
}

// ─── Navigation helpers ───────────────────────────────────────────────────────

/**
 * Advance to the next track, respecting loop modes.
 * Updates current, history, and queue accordingly.
 * @returns {{ next: Track|null, shouldStop: boolean }}
 */
function advance(guildId) {
    const queue = get(guildId);
    if (!queue) return { next: null, shouldStop: true };

    const { loop, current } = queue;

    // Loop: song — replay current
    if (loop === LOOP_MODES.SONG && current) {
        queue.startedAt   = Date.now();
        queue.seekOffset  = 0;
        return { next: current, shouldStop: false };
    }

    // Push current to history
    if (current) {
        queue.history.unshift(current);
        if (queue.history.length > 50) queue.history.pop();
    }

    // Loop: queue — move current to end of queue
    if (loop === LOOP_MODES.QUEUE && current) {
        queue.tracks.push(current);
    }

    // Get next
    if (queue.tracks.length === 0) {
        queue.current    = null;
        queue.startedAt  = null;
        queue.seekOffset = 0;
        return { next: null, shouldStop: true };
    }

    const next = queue.tracks.shift();
    queue.current    = next;
    queue.startedAt  = Date.now();
    queue.seekOffset = 0;
    return { next, shouldStop: false };
}

/**
 * Go back to the previous track.
 * @returns {Track|null}
 */
function previous(guildId) {
    const queue = get(guildId);
    if (!queue || queue.history.length === 0) return null;

    const prev = queue.history.shift();

    // Push current back to front of queue
    if (queue.current) {
        queue.tracks.unshift(queue.current);
    }

    queue.current    = prev;
    queue.startedAt  = Date.now();
    queue.seekOffset = 0;
    return prev;
}

/**
 * Set a track as currently playing from the front of the queue.
 * Used when starting the first track.
 */
function setCurrentFromQueue(guildId) {
    const queue = get(guildId);
    if (!queue || queue.tracks.length === 0) return null;

    const next = queue.tracks.shift();
    queue.current    = next;
    queue.startedAt  = Date.now();
    queue.seekOffset = 0;
    return next;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function setLoop(guildId, mode) {
    const queue = get(guildId);
    if (queue) queue.loop = mode;
}

function setVolume(guildId, vol) {
    const queue = get(guildId);
    if (queue) queue.volume = Math.max(0, Math.min(100, vol));
}

function setAutoplay(guildId, enabled) {
    const queue = get(guildId);
    if (queue) queue.autoplay = !!enabled;
}

function setPaused(guildId, paused) {
    const queue = get(guildId);
    if (queue) queue.paused = paused;
}

function setSeekOffset(guildId, seconds) {
    const queue = get(guildId);
    if (queue) queue.seekOffset = seconds;
}

module.exports = {
    createQueue,
    getOrCreate,
    get,
    destroy,
    add,
    remove,
    clear,
    shuffle,
    jump,
    advance,
    previous,
    setCurrentFromQueue,
    setLoop,
    setVolume,
    setAutoplay,
    setPaused,
    setSeekOffset,
    queues,
};

// Music system constants — matches Ember bot color/style conventions

const COLORS = {
    PRIMARY:  "#ff6600", // matches ping.js, recentimage.js, nowplaying.js
    ERROR:    "#ff3300", // matches playsfm.js error embeds
    NEUTRAL:  "#2f3136", // dark neutral (used in playsfm embed)
    SUCCESS:  "#00ff00",
    WARNING:  "#ffcc00",
};

const EMOJIS = {
    get MUSIC()    { return process.env.lumenMUSIC || "🎵"; },
    get LOAD()     { return process.env.lumenLOAD  || "⏳"; },
    get ERROR()    { return process.env.lumenERROR || "❌"; },
    PREVIOUS:   "⏮",
    PAUSE:      "⏸",
    RESUME:     "▶",
    SKIP:       "⏭",
    STOP:       "⏹",
    SHUFFLE:    "🔀",
    LOOP:       "🔁",
    QUEUE_LIST: "📃",
    VOL_DOWN:   "🔉",
    VOL_UP:     "🔊",
    YOUTUBE:    "🔴",
    SPOTIFY:    "🟢",
    SOUNDCLOUD: "🟠",
    SEARCH:     "🔎",
};

const SOURCE_LABELS = {
    youtube:    "YouTube",
    spotify:    "Spotify",
    soundcloud: "SoundCloud",
    search:     "Search",
};

const SOURCE_EMOJIS = {
    youtube:    EMOJIS.YOUTUBE,
    spotify:    EMOJIS.SPOTIFY,
    soundcloud: EMOJIS.SOUNDCLOUD,
    search:     EMOJIS.SEARCH,
};

const LOOP_MODES = {
    NONE:  "none",
    SONG:  "song",
    QUEUE: "queue",
};

const LOOP_LABELS = {
    none:  "Off",
    song:  "🔂 Song",
    queue: "🔁 Queue",
};

const LIMITS = {
    QUEUE_PAGE_SIZE:    10,
    MAX_QUEUE_LENGTH:   500,
    DEFAULT_VOLUME:     80,
    MIN_VOLUME:         0,
    MAX_VOLUME:         100,
    MAX_PLAYLIST_SIZE:  200,
    PROGRESS_BAR_WIDTH: 18,
    NP_UPDATE_INTERVAL: 5000,  // ms between now-playing embed updates
    IDLE_TIMEOUT:       300000, // 5 min idle before leaving channel
};

const CACHE = {
    DIR:        "music-cache",
    MAX_AGE_MS: (parseInt(process.env.MUSIC_CACHE_TTL_HOURS) || 24) * 60 * 60 * 1000,
    MAX_SIZE_MB: parseInt(process.env.MUSIC_CACHE_MAX_MB) || 512,
};

const BUTTON_IDS = {
    PREVIOUS:   "music_previous",
    PAUSE:      "music_pause",
    RESUME:     "music_resume",
    SKIP:       "music_skip",
    STOP:       "music_stop",
    SHUFFLE:    "music_shuffle",
    LOOP:       "music_loop",
    QUEUE_LIST: "music_queue",
    VOL_DOWN:   "music_vol_down",
    VOL_UP:     "music_vol_up",
};

module.exports = {
    COLORS,
    EMOJIS,
    SOURCE_LABELS,
    SOURCE_EMOJIS,
    LOOP_MODES,
    LOOP_LABELS,
    LIMITS,
    CACHE,
    BUTTON_IDS,
};

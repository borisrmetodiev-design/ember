// DownloadService — stream audio for playback
// Primary: play-dl for YouTube and SoundCloud
// Fallback: yt-dlp-exec for YouTube if play-dl fails
// Spotify tracks resolve to a YouTube search first

const playdl  = require("play-dl");
const ytdlp   = require("yt-dlp-exec");
const { createReadStream } = require("fs");
const { PassThrough } = require("stream");
const { createAudioResource, StreamType } = require("@discordjs/voice");
const ffmpegPath = require("ffmpeg-static");

const CacheService    = require("./CacheService");
const { searchYouTube } = require("./SearchService");

// ─── Stream helpers ──────────────────────────────────────────────────────────

/**
 * Create an AudioResource from a readable stream (webm/opus).
 */
function makeResource(stream, type = StreamType.WebmOpus) {
    return createAudioResource(stream, {
        inputType: type,
        inlineVolume: true,
    });
}

// ─── Spotify resolution ───────────────────────────────────────────────────────

/**
 * Spotify tracks don't have direct audio. Resolve them to a YouTube URL.
 * @param {object} track - Track object (with spotifySearchQuery)
 * @returns {string|null} YouTube URL
 */
async function resolveSpotifyToYouTube(track) {
    const query = track.spotifySearchQuery || `${track.artist} ${track.title}`;
    try {
        const results = await searchYouTube(query, null);
        return results[0]?.url || null;
    } catch (err) {
        console.error("[DownloadService] Spotify→YouTube resolve error:", err.message);
        return null;
    }
}

// ─── YouTube streaming ────────────────────────────────────────────────────────

/**
 * Stream a YouTube URL using play-dl (primary method).
 */
async function streamYouTubePlaydl(url, seekSeconds = 0) {
    const options = {
        discordPlayerCompatibility: true,
        quality: 2, // highest quality webm/opus
    };

    if (seekSeconds > 0) {
        options.seek = seekSeconds;
    }

    const stream = await playdl.stream(url, options);
    return makeResource(stream.stream, stream.type === "opus" ? StreamType.Opus : StreamType.WebmOpus);
}

/**
 * Stream a YouTube URL using yt-dlp (fallback method).
 */
async function streamYouTubeYtdlp(url) {
    const pass = new PassThrough();

    const ytdlpProc = ytdlp.exec(url, {
        format: "bestaudio",
        output: "-",
        quiet: true,
        noPlaylist: true, // camelCase, not "no-playlist"
    });

    ytdlpProc.stdout.pipe(pass);

    ytdlpProc.catch(err => {
        console.error("[DownloadService] yt-dlp process error:", err.message);
        pass.destroy(err);
    });

    return createAudioResource(pass, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
    });
}

// ─── SoundCloud streaming ─────────────────────────────────────────────────────

async function streamSoundCloud(url, seekSeconds = 0) {
    const options = { discordPlayerCompatibility: true };
    if (seekSeconds > 0) options.seek = seekSeconds;

    const stream = await playdl.stream(url, options);
    return makeResource(stream.stream, stream.type === "opus" ? StreamType.Opus : StreamType.WebmOpus);
}

// ─── Cached file streaming ────────────────────────────────────────────────────

async function streamFromCache(filePath) {
    const stream = createReadStream(filePath);
    return createAudioResource(stream, {
        inputType: StreamType.WebmOpus,
        inlineVolume: true,
    });
}

/**
 * Download a track to cache in the background (non-blocking).
 */
function cacheInBackground(cacheKey, playUrl, track) {
    if (!playUrl || !cacheKey) return;

    setImmediate(async () => {
        try {
            if (await CacheService.get(cacheKey)) return;

            const filePath = CacheService.getExpectedPath(cacheKey);
            await ytdlp(playUrl, {
                format: "bestaudio[ext=webm]/bestaudio/best",
                output: filePath,
                quiet: true,
                noWarnings: true,
                noPlaylist: true,
                noOverwrites: true,
            });

            await CacheService.set(cacheKey, filePath, {
                title: track.title,
                artist: track.artist,
                duration: track.duration,
            });
            await CacheService.enforceSizeLimit();
            console.log(`[DownloadService] Cached: ${track.title}`);
        } catch (err) {
            console.warn(`[DownloadService] Background cache failed for "${track.title}":`, err.message);
        }
    });
}

function getCacheKey(track) {
    return track.source === "spotify"
        ? (track.spotifySearchQuery || `${track.artist} ${track.title}`)
        : track.url;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Get an AudioResource for a track.
 * Handles cache, Spotify→YouTube resolution, and fallbacks.
 * @param {object} track - Track object
 * @param {number} seekSeconds - optional seek offset
 * @returns {AudioResource}
 */
async function getResource(track, seekSeconds = 0) {
    const cacheKey = getCacheKey(track);

    // 1. Check cache (only if not seeking — seeking from cache unsupported)
    if (seekSeconds === 0) {
        const cachedPath = await CacheService.get(cacheKey);
        if (cachedPath) {
            console.log(`[DownloadService] Cache hit: ${track.title}`);
            try {
                return await streamFromCache(cachedPath);
            } catch (err) {
                console.warn("[DownloadService] Cache stream failed, falling through:", err.message);
            }
        }
    }

    // 2. Resolve Spotify to YouTube
    let playUrl = track.url;
    if (track.source === "spotify") {
        const ytUrl = await resolveSpotifyToYouTube(track);
        if (!ytUrl) throw new Error(`Could not find YouTube source for Spotify track: ${track.title}`);
        playUrl = ytUrl;
    }

    // 3. Stream YouTube
    if (playUrl && (playUrl.includes("youtube.com") || playUrl.includes("youtu.be"))) {
        try {
            const resource = await streamYouTubePlaydl(playUrl, seekSeconds);
            if (seekSeconds === 0) cacheInBackground(cacheKey, playUrl, track);
            return resource;
        } catch (err) {
            console.warn(`[DownloadService] play-dl failed for "${track.title}", trying yt-dlp:`, err.message);
            try {
                const resource = await streamYouTubeYtdlp(playUrl);
                if (seekSeconds === 0) cacheInBackground(cacheKey, playUrl, track);
                return resource;
            } catch (fallbackErr) {
                console.error("[DownloadService] yt-dlp fallback also failed:", fallbackErr.message);
                throw new Error(`Failed to stream "${track.title}": ${fallbackErr.message}`);
            }
        }
    }

    // 4. Stream SoundCloud
    if (track.source === "soundcloud") {
        try {
            const resource = await streamSoundCloud(track.url, seekSeconds);
            if (seekSeconds === 0) cacheInBackground(cacheKey, track.url, track);
            return resource;
        } catch (err) {
            throw new Error(`Failed to stream SoundCloud track "${track.title}": ${err.message}`);
        }
    }

    throw new Error(`Unsupported track source: ${track.source}`);
}

module.exports = { getResource, resolveSpotifyToYouTube };

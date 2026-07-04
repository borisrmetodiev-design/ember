// SearchService — source detection and track resolution
// Supports YouTube, Spotify, SoundCloud, plain text search
// Reuses existing src/services/spotify.js — no duplication

const playdl = require("play-dl");
const { search: ytSearch } = require("yt-search");
const spotifyService = require("../spotify");

// ─── Source Detection ────────────────────────────────────────────────────────

const PATTERNS = {
    youtube:    /(?:youtube\.com\/(?:watch\?v=|playlist\?list=)|youtu\.be\/)/i,
    ytPlaylist: /youtube\.com\/playlist\?list=/i,
    spotify:    /(?:open\.)?spotify\.com\//i,
    soundcloud: /soundcloud\.com\//i,
};

/**
 * Detect the type of input
 * @param {string} input
 * @returns {{ type: string, url?: string, query?: string }}
 */
function detect(input) {
    input = input.trim();

    if (PATTERNS.youtube.test(input)) {
        if (PATTERNS.ytPlaylist.test(input)) return { type: "youtube_playlist", url: input };
        return { type: "youtube_url", url: input };
    }
    if (PATTERNS.spotify.test(input)) {
        // Determine Spotify entity type
        if (input.includes("/track/"))    return { type: "spotify_track",    url: input };
        if (input.includes("/playlist/")) return { type: "spotify_playlist", url: input };
        if (input.includes("/album/"))    return { type: "spotify_album",    url: input };
        return { type: "spotify_track", url: input };
    }
    if (PATTERNS.soundcloud.test(input)) {
        if (input.includes("/sets/"))     return { type: "soundcloud_playlist", url: input };
        return { type: "soundcloud_url", url: input };
    }

    // Plain text — search YouTube
    return { type: "youtube_search", query: input };
}

// ─── Track Shape ─────────────────────────────────────────────────────────────

function makeTrack({ title, artist, duration, url, thumbnail, source, requester, extra = {} }) {
    return { title, artist, duration, url, thumbnail, source, requester, ...extra };
}

// ─── YouTube ─────────────────────────────────────────────────────────────────

/**
 * Search YouTube for tracks.
 * @param {string} query
 * @param {object} requester - Discord user object
 * @returns {Track[]}
 */
/**
 * Score a YouTube result — higher score = more likely to be the "official audio" / clean track version.
 */
function scoreAudioPreference(video) {
    const title = (video.title || "").toLowerCase();
    const channel = (video.author?.name || "").toLowerCase();
    let score = 0;

    if (/official audio/.test(title)) score += 100;
    else if (/\baudio\b/.test(title)) score += 60;
    if (/\btopic\b/.test(channel)) score += 90; // auto-generated "Artist - Topic" channels are almost always clean audio
    if (/lyric/.test(title)) score += 20;

    if (/official video/.test(title)) score -= 40;
    if (/\b(mv|music video)\b/.test(title)) score -= 30;
    if (/\blive\b/.test(title)) score -= 60;
    if (/\bcover\b/.test(title)) score -= 90;
    if (/\bremix\b/.test(title)) score -= 60;
    if (/\breaction\b/.test(title)) score -= 100;

    return score;
}

async function searchYouTube(query, requester) {
    try {
        const results = await ytSearch({ query, pages: 1 });
        const videos = (results.videos || [])
            .filter(v => v.seconds > 0 && v.seconds < 10800) // max 3h, skip livestreams
            .slice(0, 10); // widen the pool before scoring

        videos.sort((a, b) => scoreAudioPreference(b) - scoreAudioPreference(a));

        return videos.slice(0, 5).map(v => makeTrack({
            title:     v.title,
            artist:    v.author?.name || "Unknown",
            duration:  v.seconds * 1000,
            url:       v.url,
            thumbnail: v.thumbnail,
            source:    "youtube",
            requester,
        }));
    } catch (err) {
        console.error("[SearchService] YouTube search error:", err.message);
        return [];
    }
}

/**
 * Resolve a YouTube video URL to a single Track.
 * @param {string} url
 * @param {object} requester
 * @returns {Track|null}
 */
async function resolveYouTubeUrl(url, requester) {
    try {
        const info = await playdl.video_info(url);
        const details = info.video_details;

        return makeTrack({
            title:     details.title,
            artist:    details.channel?.name || "Unknown",
            duration:  (details.durationInSec || 0) * 1000,
            url:       details.url,
            thumbnail: details.thumbnails?.[0]?.url || null,
            source:    "youtube",
            requester,
        });
    } catch (err) {
        console.error("[SearchService] resolveYouTubeUrl error:", err.message);
        // Fallback: ytSearch for the URL
        try {
            const results = await ytSearch(url);
            const v = results.videos?.[0];
            if (v) return makeTrack({
                title:     v.title,
                artist:    v.author?.name || "Unknown",
                duration:  v.seconds * 1000,
                url:       v.url,
                thumbnail: v.thumbnail,
                source:    "youtube",
                requester,
            });
        } catch {}
        return null;
    }
}

/**
 * Resolve a YouTube playlist URL to Track[].
 * @param {string} url
 * @param {object} requester
 * @returns {{ name: string, tracks: Track[] }}
 */
async function resolveYouTubePlaylist(url, requester) {
    try {
        const playlist = await playdl.playlist_info(url, { incomplete: true });
        const videos = await playlist.all_videos();

        const tracks = videos.slice(0, 200).map(v => makeTrack({
            title:     v.title,
            artist:    v.channel?.name || "Unknown",
            duration:  (v.durationInSec || 0) * 1000,
            url:       v.url,
            thumbnail: v.thumbnails?.[0]?.url || null,
            source:    "youtube",
            requester,
        }));

        return { name: playlist.title || "YouTube Playlist", tracks };
    } catch (err) {
        console.error("[SearchService] resolveYouTubePlaylist error:", err.message);
        return { name: "YouTube Playlist", tracks: [] };
    }
}

// ─── Spotify ──────────────────────────────────────────────────────────────────

/**
 * Extract Spotify ID and type from URL.
 */
function parseSpotifyUrl(url) {
    try {
        const u = new URL(url);
        const parts = u.pathname.split("/").filter(Boolean);
        // parts = ['track', '<id>'] or ['playlist', '<id>'] etc
        const type = parts[0];
        const id   = parts[1]?.split("?")[0];
        return { type, id };
    } catch {
        return null;
    }
}

/**
 * Convert a Spotify track object (from Spotify API) to our Track shape.
 * Audio is sourced from YouTube — Spotify only provides metadata.
 */
function spotifyTrackToShape(spotifyTrack, requester) {
    const title = spotifyTrack.name;
    const artist = Array.isArray(spotifyTrack.artists)
        ? spotifyTrack.artists.map(a => (typeof a === "string" ? a : a?.name)).filter(Boolean).join(", ")
        : "Unknown";
    const duration  = spotifyTrack.duration_ms || 0;
    const thumbnail = spotifyTrack.album?.images?.[0]?.url || null;
    const url       = spotifyTrack.external_urls?.spotify
        || (spotifyTrack.id ? `https://open.spotify.com/track/${spotifyTrack.id}` : null);

    return makeTrack({
        title, artist, duration,
        url,
        thumbnail,
        source:   "spotify",
        requester,
        extra: { spotifySearchQuery: `${artist} ${title}` },
    });
}

/**
 * Resolve a Spotify track URL to a Track.
 */
async function resolveSpotifyTrack(url, requester) {
    try {
        const parsed = parseSpotifyUrl(url);
        if (!parsed) return null;

        const data = await spotifyService.getTrackData(parsed.id);
        if (!data) return null;

        return spotifyTrackToShape(data, requester);
    } catch (err) {
        console.error("[SearchService] resolveSpotifyTrack error:", err.message);
        return null;
    }
}

/**
 * Resolve a Spotify playlist URL to Track[].
 */
async function resolveSpotifyPlaylist(url, requester) {
    try {
        const parsed = parseSpotifyUrl(url);
        if (!parsed) return { name: "Spotify Playlist", tracks: [] };

        const data = await spotifyService.getPlaylistTracks(parsed.id);
        if (!data) return { name: "Spotify Playlist", tracks: [] };

        const tracks = data.tracks
            .filter(item => item && item.name)
            .slice(0, 200)
            .map(item => spotifyTrackToShape(item, requester));

        return { name: data.name || "Spotify Playlist", tracks };
    } catch (err) {
        console.error("[SearchService] resolveSpotifyPlaylist error:", err.message);
        return { name: "Spotify Playlist", tracks: [] };
    }
}

/**
 * Resolve a Spotify album URL to Track[].
 */
async function resolveSpotifyAlbum(url, requester) {
    try {
        const parsed = parseSpotifyUrl(url);
        if (!parsed) return { name: "Spotify Album", tracks: [] };

        const data = await spotifyService.getAlbumTracks(parsed.id);
        if (!data) return { name: "Spotify Album", tracks: [] };

        const tracks = data.tracks
            .filter(item => item && item.name)
            .map(item => {
                // Album tracks don't have album images at the track level — copy it down
                const enriched = { ...item, album: data };
                return spotifyTrackToShape(enriched, requester);
            })
            .slice(0, 200);

        return { name: data.name || "Spotify Album", tracks };
    } catch (err) {
        console.error("[SearchService] resolveSpotifyAlbum error:", err.message);
        return { name: "Spotify Album", tracks: [] };
    }
}

// ─── SoundCloud ──────────────────────────────────────────────────────────────

/**
 * Resolve a SoundCloud URL to a single Track.
 */
async function resolveSoundCloudUrl(url, requester) {
    try {
        const info = await playdl.soundcloud(url);
        if (!info) return null;

        return makeTrack({
            title:     info.name,
            artist:    info.user?.name || "Unknown",
            duration:  (info.durationInMs) || 0,
            url:       info.url,
            thumbnail: info.thumbnail || null,
            source:    "soundcloud",
            requester,
        });
    } catch (err) {
        console.error("[SearchService] resolveSoundCloudUrl error:", err.message);
        return null;
    }
}

/**
 * Resolve a SoundCloud playlist/set URL.
 */
async function resolveSoundCloudPlaylist(url, requester) {
    try {
        const info = await playdl.soundcloud(url);
        if (!info) return { name: "SoundCloud Set", tracks: [] };

        // If it's a set, info.tracks exists
        const rawTracks = info.tracks || [];
        const tracks = rawTracks.slice(0, 200).map(t => makeTrack({
            title:     t.name,
            artist:    t.user?.name || "Unknown",
            duration:  t.durationInMs || 0,
            url:       t.url,
            thumbnail: t.thumbnail || null,
            source:    "soundcloud",
            requester,
        }));

        return { name: info.name || "SoundCloud Set", tracks };
    } catch (err) {
        console.error("[SearchService] resolveSoundCloudPlaylist error:", err.message);
        return { name: "SoundCloud Set", tracks: [] };
    }
}

/**
 * Search SoundCloud for tracks.
 */
async function searchSoundCloud(query, requester) {
    try {
        const results = await playdl.search(query, { source: { soundcloud: "tracks" }, limit: 5 });
        return results.map(t => makeTrack({
            title:     t.name,
            artist:    t.user?.name || "Unknown",
            duration:  t.durationInMs || 0,
            url:       t.url,
            thumbnail: t.thumbnail || null,
            source:    "soundcloud",
            requester,
        }));
    } catch (err) {
        console.error("[SearchService] searchSoundCloud error:", err.message);
        return [];
    }
}

// ─── Autoplay ────────────────────────────────────────────────────────────────

/**
 * Find related tracks for autoplay when the queue runs out.
 * @param {object} currentTrack
 * @param {object} requester
 * @param {number} limit
 * @returns {Track[]}
 */
async function getRelatedTracks(currentTrack, requester, limit = 3) {
    try {
        const queries = [
            `${currentTrack.artist} ${currentTrack.title}`,
            `${currentTrack.artist} mix`,
            currentTrack.artist,
        ];

        const seen = new Set([currentTrack.url, currentTrack.title?.toLowerCase()].filter(Boolean));
        const results = [];

        for (const query of queries) {
            const found = await searchYouTube(query, requester);
            for (const track of found) {
                const key = track.url || track.title?.toLowerCase();
                if (!key || seen.has(key)) continue;
                seen.add(key);
                results.push(track);
                if (results.length >= limit) return results;
            }
        }

        return results;
    } catch (err) {
        console.error("[SearchService] getRelatedTracks error:", err.message);
        return [];
    }
}

// ─── Main Resolve Entry Point ─────────────────────────────────────────────────

/**
 * Resolve any input (URL or search query) into tracks.
 * @param {string} input
 * @param {object} requester - Discord user
 * @returns {{ tracks: Track[], name?: string, isPlaylist: boolean }}
 */
async function resolve(input, requester) {
    const detected = detect(input);

    switch (detected.type) {
        case "youtube_url": {
            const track = await resolveYouTubeUrl(detected.url, requester);
            if (track) await enrichWithCoverArt(track);
            return { tracks: track ? [track] : [], isPlaylist: false };
        }
        case "youtube_playlist": {
            const result = await resolveYouTubePlaylist(detected.url, requester);
            return { ...result, isPlaylist: true };
        }
        case "spotify_track": {
            const track = await resolveSpotifyTrack(detected.url, requester);
            return { tracks: track ? [track] : [], isPlaylist: false };
        }
        case "spotify_playlist": {
            const result = await resolveSpotifyPlaylist(detected.url, requester);
            return { ...result, isPlaylist: true };
        }
        case "spotify_album": {
            const result = await resolveSpotifyAlbum(detected.url, requester);
            return { ...result, isPlaylist: true };
        }
        case "soundcloud_url": {
            const track = await resolveSoundCloudUrl(detected.url, requester);
            return { tracks: track ? [track] : [], isPlaylist: false };
        }
        case "soundcloud_playlist": {
            const result = await resolveSoundCloudPlaylist(detected.url, requester);
            return { ...result, isPlaylist: true };
        }
        case "youtube_search":
        default: {
            return await resolveViaSpotifyThenYoutube(detected.query, requester);
        }
    }
}

async function resolveViaSpotifyThenYoutube(query, requester) {
    let ytQuery = query;
    let coverArt = null;
    let spotifyMeta = null;

    try {
        spotifyMeta = await spotifyService.searchTrack(query);
        if (spotifyMeta?.name && spotifyMeta?.artist) {
            ytQuery = `${spotifyMeta.artist} - ${spotifyMeta.name}`;
            coverArt = spotifyMeta.image;
        }
    } catch (err) {
        console.error("[SearchService] Spotify pre-search failed:", err.message);
    }

    const results = await searchYouTube(ytQuery, requester);
    const top = results[0] || null;
    if (!top) return { tracks: [], isPlaylist: false };

    if (coverArt) {
        top.thumbnail = coverArt;
    } else {
        await enrichWithCoverArt(top); // fallback if Spotify had no match
    }

    // Prefer Spotify's canonical title/artist for display accuracy
    if (spotifyMeta?.name)   top.title  = spotifyMeta.name;
    if (spotifyMeta?.artist) top.artist = spotifyMeta.artist;

    return { tracks: [top], isPlaylist: false };
}

async function resolveViaSpotifyThenYoutube(query, requester) {
    let ytQuery = query;
    let coverArt = null;
    let spotifyMeta = null;

    try {
        spotifyMeta = await spotifyService.searchTrack(query);
        if (spotifyMeta?.name && spotifyMeta?.artist) {
            ytQuery = `${spotifyMeta.artist} - ${spotifyMeta.name}`;
            coverArt = spotifyMeta.image;
        }
    } catch (err) {
        console.error("[SearchService] Spotify pre-search failed:", err.message);
    }

    const results = await searchYouTube(ytQuery, requester);
    const top = results[0] || null;
    if (!top) return { tracks: [], isPlaylist: false };

    if (coverArt) {
        top.thumbnail = coverArt;
    } else {
        await enrichWithCoverArt(top); // fallback if Spotify had no match
    }

    // Prefer Spotify's canonical title/artist for display accuracy
    if (spotifyMeta?.name)   top.title  = spotifyMeta.name;
    if (spotifyMeta?.artist) top.artist = spotifyMeta.artist;

    return { tracks: [top], isPlaylist: false };
}
function cleanTitleForCoverSearch(title) {
    return (title || "")
        .replace(/\(.*?\)/g, "")
        .replace(/\[.*?\]/g, "")
        .replace(/official\s*(music\s*)?video/gi, "")
        .replace(/official\s*audio/gi, "")
        .replace(/lyrics?/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanArtistForCoverSearch(artist) {
    return (artist || "").replace(/\s*-\s*topic$/i, "").trim();
}

/**
 * Try to replace a YouTube-sourced track's thumbnail with real album/single cover art from Spotify.
 * Falls back silently to the existing (video) thumbnail if nothing is found.
 */
async function enrichWithCoverArt(track) {
    if (!track) return track;
    try {
        const cleanTitle  = cleanTitleForCoverSearch(track.title);
        const cleanArtist = cleanArtistForCoverSearch(track.artist);
        const coverUrl = await spotifyService.getTrackImage(cleanTitle, cleanArtist);
        if (coverUrl) track.thumbnail = coverUrl;
    } catch (err) {
        console.error("[SearchService] enrichWithCoverArt error:", err.message);
    }
    return track;
}

module.exports = {
    detect,
    resolve,
    searchYouTube,
    searchSoundCloud,
    getRelatedTracks,
    resolveYouTubeUrl,
    resolveYouTubePlaylist,
    resolveSpotifyTrack,
    resolveSpotifyPlaylist,
    resolveSpotifyAlbum,
    resolveSoundCloudUrl,
    resolveSoundCloudPlaylist,
    enrichWithCoverArt,
};

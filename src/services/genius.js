const Genius = require("genius-lyrics");

// Node-fetch v3 ESM-compatible import for CommonJS
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

class GeniusService {
    constructor() {
        console.log("Initializing Genius Service...");
        try {
            if (process.env.GENIUS_ACCESS_TOKEN) {
                this.client = new Genius.Client(process.env.GENIUS_ACCESS_TOKEN);
                console.log("Genius Client initialized.");
            } else {
                console.log("Genius Client not initialized: GENIUS_ACCESS_TOKEN is missing. Falling back to LRCLIB for search.");
            }
        } catch (err) {
            console.error("Failed to initialize Genius Client:", err);
        }
    }

    async searchSongs(query) {
        // Try Genius first if client is initialized
        if (this.client) {
            try {
                const songs = await Promise.race([
                    this.client.songs.search(query),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Genius search timeout")), 10000))
                ]);
                
                // Map the library's Song objects to our expected format 
                return songs.map(song => ({
                    id: song.id,
                    title: song.title,
                    artist: song.artist.name,
                    url: song.url,
                    image: song.thumbnail
                }));
            } catch (error) {
                console.error("Genius search failed, falling back to LRCLIB:", error.message);
            }
        }

        // Fallback or Primary search using LRCLIB
        try {
            const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
            const response = await fetch(searchUrl, {
                headers: {
                    "User-Agent": "LumenDiscordBot/1.0.0 (https://github.com/borisrmetodiev-design/lumen)"
                }
            });

            if (response.status === 200) {
                const data = await response.json();
                return data.map(track => ({
                    id: track.id.toString(),
                    title: track.name || track.trackName,
                    artist: track.artistName,
                    url: `https://lrclib.net/api/get/${track.id}`,
                    image: null // LRCLIB does not provide images/thumbnails
                }));
            }
        } catch (error) {
            console.error("LRCLIB search error:", error.message);
        }

        return [];
    }

    async searchSong(query) {
        const songs = await this.searchSongs(query);
        return songs.length > 0 ? songs[0] : null;
    }

    async fetchLyrics(songId, title, artist) {
        let queryTitle = title;
        let queryArtist = artist;

        // If title/artist are missing, try fetching metadata from Genius if client exists
        if ((!queryTitle || !queryArtist) && this.client && songId && !/^\d+$/.test(songId)) {
            try {
                const song = await this.client.songs.get(songId);
                queryTitle = song.title;
                queryArtist = song.artist.name;
            } catch (err) {
                console.error(`Failed to fetch song details from Genius for ID ${songId}:`, err.message);
            }
        }

        // If we still don't have title/artist, but have a songId that looks like an LRCLIB ID,
        // we can fetch the track details from LRCLIB first
        if ((!queryTitle || !queryArtist) && songId) {
            try {
                const getUrl = `https://lrclib.net/api/get/${songId}`;
                const response = await fetch(getUrl, {
                    headers: {
                        "User-Agent": "LumenDiscordBot/1.0.0 (https://github.com/borisrmetodiev-design/lumen)"
                    }
                });
                if (response.status === 200) {
                    const track = await response.json();
                    queryTitle = track.name || track.trackName;
                    queryArtist = track.artistName;
                    if (track.plainLyrics) {
                        return track.plainLyrics;
                    }
                }
            } catch (err) {
                console.error(`Failed to fetch track details from LRCLIB for ID ${songId}:`, err.message);
            }
        }

        if (!queryTitle || !queryArtist) {
            throw new Error("Could not determine song title or artist to fetch lyrics.");
        }

        try {
            // 1. Try direct get endpoint on LRCLIB
            const getUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(queryArtist)}&track_name=${encodeURIComponent(queryTitle)}`;
            const response = await fetch(getUrl, {
                headers: {
                    "User-Agent": "LumenDiscordBot/1.0.0 (https://github.com/borisrmetodiev-design/lumen)"
                }
            });

            if (response.status === 200) {
                const data = await response.json();
                if (data.plainLyrics) {
                    return data.plainLyrics;
                }
            }

            // 2. If direct get doesn't have plainLyrics or fails (e.g., 404), try search
            const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${queryArtist} ${queryTitle}`)}`;
            const searchResponse = await fetch(searchUrl, {
                headers: {
                    "User-Agent": "LumenDiscordBot/1.0.0 (https://github.com/borisrmetodiev-design/lumen)"
                }
            });

            if (searchResponse.status === 200) {
                const results = await searchResponse.json();
                const matched = results.find(r => r.plainLyrics && r.plainLyrics.trim().length > 0);
                if (matched) {
                    return matched.plainLyrics;
                }
            }

            throw new Error("No plain lyrics found on LRCLIB.");
        } catch (error) {
            console.error(`Failed to fetch lyrics from LRCLIB for ${queryArtist} - ${queryTitle}:`, error.message);
            throw new Error("Could not fetch lyrics from Genius/LRCLIB. The song might be instrumental or lyrics are unavailable.");
        }
    }
}

module.exports = new GeniusService();

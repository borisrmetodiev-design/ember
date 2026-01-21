const Genius = require("genius-lyrics");

class GeniusService {
    constructor() {
        console.log("Initializing Genius Service...");
        try {
            this.client = new Genius.Client(process.env.GENIUS_ACCESS_TOKEN);
            console.log("Genius Client initialized.");
        } catch (err) {
            console.error("Failed to initialize Genius Client:", err);
        }
    }

    async searchSongs(query) {
        if (!process.env.GENIUS_ACCESS_TOKEN) {
            throw new Error("GENIUS_ACCESS_TOKEN is not configured in the environment.");
        }

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
            console.error("Genius search error:", error.message);
            // Return empty array on error to safely handle failures
            return [];
        }
    }

    async searchSong(query) {
        const songs = await this.searchSongs(query);
        return songs.length > 0 ? songs[0] : null;
    }

    async fetchLyrics(songId) {
        try {
            // The library expects a number or string ID
            const song = await this.client.songs.get(songId);
            
            // Add a timeout for the actual lyrics scraping which is prone to Cloudflare hanging
            const lyrics = await Promise.race([
                song.lyrics(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Genius lyrics fetch timeout")), 15000))
            ]);
            
            return lyrics;
        } catch (error) {
            console.error(`Failed to fetch lyrics for ID ${songId}:`, error.message);
            if (error.message.includes("timeout")) {
                throw new Error("Genius search timed out. Their servers might be slow or blocking the request.");
            }
            throw new Error("Could not fetch lyrics from Genius. They might be blocking the request (Cloudflare).");
        }
    }
}

module.exports = new GeniusService();

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
            const songs = await this.client.songs.search(query);
            
            // Map the library's Song objects to our expected format 
            return songs.map(song => ({
                id: song.id,
                title: song.title,
                artist: song.artist.name,
                url: song.url,
                image: song.thumbnail
            }));
        } catch (error) {
            console.error("Genius search error:", error);
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
            const lyrics = await song.lyrics();
            return lyrics;
        } catch (error) {
            console.error(`Failed to fetch lyrics for ID ${songId}:`, error);
            throw new Error("Could not fetch lyrics from Genius.");
        }
    }
}

module.exports = new GeniusService();

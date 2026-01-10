require("dotenv").config();
const geniusService = require('./src/services/genius');

async function testLibrary() {
    console.log("Testing Genius-Lyrics library integration...");
    const query = "Bohemian Rhapsody";
    
    try {
        console.log(`Searching for "${query}"...`);
        const song = await geniusService.searchSong(query);
        
        if (!song) {
            console.log("FAILED: Song not found.");
            return;
        }
        
        console.log(`Found song: ${song.title} by ${song.artist} (ID: ${song.id})`);
        
        console.log("Fetching lyrics...");
        const lyrics = await geniusService.fetchLyrics(song.id);
        
        if (lyrics && lyrics.length > 100) {
            console.log("SUCCESS: Lyrics fetched successfully!");
            console.log("Snippet: " + lyrics.substring(0, 100).replace(/\n/g, " ") + "...");
        } else {
            console.log("FAILED: Lyrics were empty or too short.");
            console.log("Result:", lyrics);
        }
    } catch (error) {
        console.error("ERROR: Test failed.");
        console.error(error);
    }
}

testLibrary();

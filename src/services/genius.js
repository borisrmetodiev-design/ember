const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

class GeniusService {
    constructor() {
        this.accessToken = process.env.GENIUS_ACCESS_TOKEN;
    }

    async searchSongs(query) {
        if (!this.accessToken) {
            throw new Error("GENIUS_ACCESS_TOKEN is not configured in the environment.");
        }

        const url = `https://api.genius.com/search?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${this.accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Genius API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.response.hits
            .filter(hit => hit.type === "song")
            .map(hit => ({
                id: hit.result.id,
                title: hit.result.title,
                artist: hit.result.primary_artist.name,
                url: hit.result.url,
                image: hit.result.song_art_image_thumbnail_url
            }));
    }

    async searchSong(query) {
        const songs = await this.searchSongs(query);
        return songs.length > 0 ? songs[0] : null;
    }

    async fetchLyrics(url) {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch lyrics page: ${response.statusText}`);
        }

        const html = await response.text();
        let lyrics = "";

        // Function to extract text from a balanced tag starting at a specific index
        const getBalancedContent = (startIdx, openTag, closeTag) => {
            let depth = 0;
            let currentIdx = startIdx;
            
            while (currentIdx < html.length) {
                const openMatch = html.substring(currentIdx, currentIdx + openTag.length) === openTag;
                const closeMatch = html.substring(currentIdx, currentIdx + closeTag.length) === closeTag;

                if (openMatch) depth++;
                if (closeMatch) {
                    depth--;
                    if (depth === 0) {
                        return html.substring(startIdx, currentIdx + closeTag.length);
                    }
                }
                currentIdx++;
            }
            return null;
        };

        // Find all potential starts
        const startRegex = /<(div|span) [^>]*(data-lyrics-container="true"|class="[a-zA-Z0-9_-]*Lyrics__Container[a-zA-Z0-9_-]*")[^>]*>/g;
        let match;
        const seenStarts = new Set();

        while ((match = startRegex.exec(html)) !== null) {
            const startIdx = match.index;
            const tagName = match[1];
            
            // Skip if this start is already part of a major container we processed
            let skip = false;
            for (const seen of seenStarts) {
                if (startIdx >= seen.start && startIdx <= seen.end) {
                    skip = true;
                    break;
                }
            }
            if (skip) continue;

            const content = getBalancedContent(startIdx, `<${tagName}`, `</${tagName}>`);
            if (content) {
                seenStarts.add({ start: startIdx, end: startIdx + content.length });
                
                let chunk = content
                    .replace(/<script[\s\S]*?<\/script>/gi, "") // Remove scripts
                    .replace(/<(?!br\s*\/?)[^>]+>/gi, "") // Remove all tags except <br>
                    .replace(/<br\s*\/?>/gi, "\n"); // Replace <br> with \n
                
                lyrics += chunk + "\n";
            }
        }

        // Fallback for older layouts
        if (!lyrics.trim()) {
            const fallbacks = [
                { regex: /<div [^>]*class="lyrics"[^>]*>/i, tag: "div" },
                { regex: /<div [^>]*id="lyrics-root"[^>]*>/i, tag: "div" },
                { regex: /<div [^>]*class="[a-zA-Z0-9_-]*song_body-lyrics[a-zA-Z0-9_-]*"[^>]*>/i, tag: "div" }
            ];

            for (const fb of fallbacks) {
                const fbMatch = fb.regex.exec(html);
                if (fbMatch) {
                    const content = getBalancedContent(fbMatch.index, `<${fb.tag}`, `</${fb.tag}>`);
                    if (content) {
                        lyrics = content
                            .replace(/<script[\s\S]*?<\/script>/gi, "")
                            .replace(/<(?!br\s*\/?)[^>]+>/gi, "")
                            .replace(/<br\s*\/?>/gi, "\n");
                        break;
                    }
                }
            }
        }

        if (!lyrics.trim()) return "Could not extract lyrics from the page.";

        // Final cleaning
        return lyrics
            .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
            .replace(/&#x([a-fA-F0-9]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ')
            .replace(/\u200b/g, '') // Zero-width space
            .replace(/\u200e/g, '') // Left-to-right mark
            .replace(/\r/g, "") // Carriage returns
            .replace(/^\s*\d*\s*Contributors\s*Translations.*/gim, "")
            .replace(/^\s*\d*\s*Contributors.*/gim, "")
            .replace(/^\s*Translations.*/gim, "")
            .replace(/GIF\s-\s[a-f0-9]+\.[a-z]+\.[a-z]+/gi, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }
}

module.exports = new GeniusService();

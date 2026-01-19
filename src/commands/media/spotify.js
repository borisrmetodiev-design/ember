const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const play = require("play-dl");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const os = require("os");
const GeniusService = require("../../services/genius"); // Assuming this exists per lyrics.js

ffmpeg.setFfmpegPath(ffmpegPath);

module.exports = {
    data: new SlashCommandBuilder()
        .setName("spotify")
        .setDescription("Download a song from Spotify (or query) as MP3")
        .addStringOption(option =>
            option.setName("query")
                .setDescription("The song name or Spotify URL")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    name: "spotify",
    aliases: ["sp"],

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        if (!focusedValue) return interaction.respond([]).catch(() => {});

        try {
            // Use Genius for autocomplete as it's reliable for song titles
            // OR use play-dl search if it works without auth. 
            // Sticking to Genius as it's consistent with lyrics command.
            const results = await Promise.race([
                GeniusService.searchSongs(focusedValue),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500))
            ]);

            const choices = results.slice(0, 25).map(song => {
                const name = `${song.title} - ${song.artist}`;
                return {
                    name: name.length > 100 ? name.substring(0, 97) + "..." : name,
                    value: name // Use name as value for search
                };
            });

            if (!interaction.responded) {
                await interaction.respond(choices);
            }
        } catch (err) {
            // console.error(`Autocomplete error for spotify: ${err.message}`);
            // Silent fail for autocomplete
            if (!interaction.responded) await interaction.respond([]).catch(() => {});
        }
    },

    async executeSlash(interaction) {
        await this.handleSpotify(interaction, interaction.options.getString("query"), true);
    },

    async executePrefix(message, args) {
        const query = args.join(" ");
        if (!query) return message.reply("Please provide a song name or URL!");
        await this.handleSpotify(message, query, false);
    },

    async handleSpotify(context, query, isSlash) {
        const loadingEmoji = process.env.lumenLOAD || "⏳";
        
        // Initial reply/defer
        let msg;
        try {
            if (isSlash) {
                await context.deferReply();
                msg = await context.fetchReply();
            } else {
                msg = await context.reply(`${loadingEmoji} Searching and processing...`);
            }
        } catch (err) {
            return; // Interaction probably gone
        }

        try {
            let ytInfo;
            let spotifyInfo = null;
            let searchLink = null;

            // Check if it's a Spotify URL
            if (query.includes("open.spotify.com")) {
                if (play.is_expired()) {
                    await play.refreshToken(); // Attempt refresh if token functionality is used (optional)
                }
                
                try {
                    const spData = await play.spotify(query);
                    if (spData.type === 'track') {
                        spotifyInfo = spData;
                        const searchName = `${spData.name} - ${spData.artists.map(a => a.name).join(", ")}`;
                        // Find on YouTube
                        const ytResults = await play.search(searchName, { limit: 1, source: { youtube: "video" } });
                        if (ytResults.length > 0) ytInfo = ytResults[0];
                    } else if (spData.type === 'album' || spData.type === 'playlist') {
                         throw new Error("Only individual tracks can be downloaded at this time.");
                    }
                } catch (spErr) {
                    console.error(spErr);
                    // Fallback to direct search if Spotify parsing fails
                }
            }
            
            // If not found via Spotify URL or it's a text query
            if (!ytInfo) {
                // If it's a URL but not spotify (e.g. YouTube), handle it?
                // The prompt says "/spotify link command", implies Spotify focus.
                // But "query" can be text.
                const ytResults = await play.search(query, { limit: 1, source: { youtube: "video" } });
                if (ytResults.length > 0) ytInfo = ytResults[0];
            }

            if (!ytInfo) {
                throw new Error("No track found.");
            }

            // Construct Link to Query Section (User asked: "give a link to the query section")
            // This is vague. Maybe means the Spotify link or the Search Result?
            // "should give a link to the query section and it downloads the song"
            // If we found spotifyInfo, we have a link.
            const resultLink = spotifyInfo ? spotifyInfo.url : ytInfo.url;
            searchLink = resultLink;

            // Update status
            const updateMsg = (content) => isSlash ? context.editReply(content) : msg.edit(content);
            await updateMsg({ content: `${loadingEmoji} Downloading **${ytInfo.title}**...` });

            // download Stream
            // ensure URL is a string
            if (!ytInfo.url || typeof ytInfo.url !== 'string') throw new Error("Invalid YouTube URL found.");
            
            const stream = await play.stream(ytInfo.url);
            
            // convert to MP3
            // We need to save to a temp file because sending a transcoded stream directly to Discord 
            // sometimes fails to determine duration or size, but AttachmentBuilder works with Buffer/Stream.
            // Safe bet: write to temp file, send, delete.
            
            const tempFileName = `spotify_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp3`;
            const tempFilePath = path.join(os.tmpdir(), tempFileName);

            await new Promise((resolve, reject) => {
                ffmpeg(stream.stream)
                    .audioBitrate(128)
                    .format('mp3')
                    .save(tempFilePath)
                    .on('end', resolve)
                    .on('error', reject);
            });

            // Build Embed
            const embed = new EmbedBuilder()
                .setColor("#1DB954") // Spotify Green
                .setTitle(ytInfo.title)
                .setURL(resultLink)
                .setDescription(`[Click here to view on ${spotifyInfo ? "Spotify" : "YouTube"}](${resultLink})`)
                .setThumbnail(spotifyInfo ? spotifyInfo.thumbnail?.url : ytInfo.thumbnails[0]?.url)
                .setFooter({ text: "Downloaded via Lumen" });

            // Create Attachment
            const attachment = new AttachmentBuilder(tempFilePath, { name: `${ytInfo.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp3` });

            // Send
            await updateMsg({ 
                content: resultLink, // "also sends the link"
                embeds: [embed], 
                files: [attachment] 
            });

            // Cleanup
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error("Failed to delete temp file:", err);
            });

        } catch (err) {
            console.error(err);
            const errContent = `Error: ${err.message || "Failed to process request."}`;
            if (isSlash) await context.editReply({ content: errContent });
            else await msg.edit({ content: errContent });
        }
    }
};

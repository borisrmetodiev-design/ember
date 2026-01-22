const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const play = require("play-dl");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const fs = require("fs");
const path = require("path");
const os = require("os");
const GeniusService = require("../../services/genius");

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
            const results = await Promise.race([
                GeniusService.searchSongs(focusedValue),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500))
            ]);

            const choices = results.slice(0, 25).map(song => {
                const name = `${song.title} - ${song.artist}`;
                return {
                    name: name.length > 100 ? name.substring(0, 97) + "..." : name,
                    value: name
                };
            });

            if (!interaction.responded) {
                await interaction.respond(choices);
            }
        } catch (err) {
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
        
        let msg;
        try {
            if (isSlash) {
                await context.deferReply();
                msg = await context.fetchReply();
            } else {
                msg = await context.reply(`${loadingEmoji} Searching...`);
            }
        } catch (err) {
            return;
        }

        const tempFileName = `song_${Date.now()}.mp3`;
        const tempFilePath = path.join(os.tmpdir(), tempFileName);

        try {
            let searchQuery = query;
            let spotifyInfo = null;

            // If it's a Spotify URL, get the track info
            if (query.includes("open.spotify.com")) {
                try {
                    const spData = await play.spotify(query);
                    if (spData.type === 'track') {
                        spotifyInfo = spData;
                        searchQuery = `${spData.name} ${spData.artists.map(a => a.name).join(" ")}`;
                    } else {
                        throw new Error("Only individual tracks supported.");
                    }
                } catch (err) {
                    throw new Error("Failed to fetch Spotify track info.");
                }
            }

            const updateMsg = (content) => isSlash ? context.editReply(content) : msg.edit(content);
            await updateMsg({ content: `${loadingEmoji} Downloading **${searchQuery}**...` });

            // Simple yt-dlp command - no BS
            const ffmpegPath = require("ffmpeg-static").replace(/\\/g, '/');
            const ffmpegDir = path.dirname(ffmpegPath);
            
            const cmd = `yt-dlp -x --audio-format mp3 --ffmpeg-location "${ffmpegDir}" "ytsearch:${searchQuery}" -o "${tempFilePath}"`;
            
            console.log(`[DEBUG] Downloading: ${searchQuery}`);
            
            await execAsync(cmd, { timeout: 120000 });

            if (!fs.existsSync(tempFilePath)) {
                throw new Error("Download failed - file not found.");
            }

            const attachment = new AttachmentBuilder(tempFilePath, { 
                name: `${searchQuery.replace(/[^a-zA-Z0-9\s]/g, '_').substring(0, 50)}.mp3` 
            });

            await updateMsg({ 
                content: spotifyInfo ? spotifyInfo.url : "",
                files: [attachment] 
            });

            // Cleanup
            setTimeout(() => {
                fs.unlink(tempFilePath, (err) => {
                    if (err) console.error("Cleanup error:", err);
                });
            }, 1000);

        } catch (err) {
            console.error("[ERROR]", err);
            const errContent = `❌ Error: ${err.message || "Download failed"}`;
            if (isSlash) await context.editReply({ content: errContent });
            else await msg.edit({ content: errContent });
            
            if (fs.existsSync(tempFilePath)) {
                fs.unlink(tempFilePath, () => {});
            }
        }
    }
};
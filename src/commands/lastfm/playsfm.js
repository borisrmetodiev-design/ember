const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const path = require("path");
const { readJSON } = require("../../utils/database");

// Node-fetch v3 ESM-compatible import for CommonJS
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");
const MUSIC_EMOJI = () => process.env.lumenMUSIC || "🎵";

async function loadDB() {
    const data = await readJSON(dataPath);
    return data.users ? data : { users: {} };
}

const playsFMLogic = {
    async getLastFMUsername(discordId) {
        const db = await loadDB();
        return db.users[discordId] || null;
    },

    buildNoAccountEmbed(targetUser) {
        return new EmbedBuilder()
            .setColor("#ff3300")
            .setAuthor({
                name: `${targetUser.username}`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setTitle(`${MUSIC_EMOJI()} No Last.fm Account Linked`)
            .setDescription(
                `There's no LastFM account associated with ${targetUser}.\n` +
                `Please run the \`lastfmsetup\` command to connect accounts.`
            )
            .setTimestamp();
    },

    async fetchAutocomplete(mode, query) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey || !query) return [];

        let method, rootProperty, itemProperty;

        switch (mode) {
            case "artist":
                method = "artist.search";
                break;
            case "album":
                method = "album.search";
                break;
            case "track":
                method = "track.search";
                break;
            default:
                return [];
        }

        const url = `https://ws.audioscrobbler.com/2.0/?method=${method}&${mode}=${encodeURIComponent(query)}&api_key=${apiKey}&format=json&limit=10`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.error) return [];

            if (mode === "artist") {
                const globalResults = data.results?.artistmatches?.artist || [];
                // Only take results that have a name
                return globalResults
                    .filter(a => a.name)
                    .map(a => ({ name: a.name, value: a.name }))
                    .slice(0, 25);
            } else if (mode === "album") {
                const globalResults = data.results?.albummatches?.album || [];
                return globalResults
                    .filter(a => a.name && a.artist)
                    .map(a => ({ 
                        name: `${a.name} - ${a.artist}`, 
                        value: `${a.artist}|||${a.name}` 
                    }))
                    .slice(0, 25);
            } else if (mode === "track") {
                const globalResults = data.results?.trackmatches?.track || [];
                return globalResults
                    .filter(t => t.name && t.artist)
                    .map(t => ({ 
                        name: `${t.name} - ${t.artist}`, 
                        value: `${t.artist}|||${t.name}` 
                    }))
                    .slice(0, 25);
            }
        } catch (err) {
            console.error("Autocomplete fetch error: ", err);
            return [];
        }
        return [];
    },

    async getPeriodStats(username, mode, artistName, itemName = null) {
        const apiKey = process.env.LASTFM_API_KEY;
        const stats = { "7day": 0, "1month": 0 };
        
        const fetchPeriod = async (period) => {
             let method = "";
             if (mode === "artist") method = "user.gettopartists";
             else if (mode === "album") method = "user.gettopalbums";
             else if (mode === "track") method = "user.gettoptracks";
             
             // limit 1000 to catch most items
             const url = `https://ws.audioscrobbler.com/2.0/?method=${method}&user=${encodeURIComponent(username)}&api_key=${apiKey}&format=json&period=${period}&limit=1000`;
             
             try {
                const res = await fetch(url);
                const data = await res.json();
                
                let items = [];
                if (mode === "artist") items = data.topartists?.artist || [];
                else if (mode === "album") items = data.topalbums?.album || [];
                else if (mode === "track") items = data.toptracks?.track || [];

                const found = items.find(i => {
                    const iArtist = typeof i.artist === 'object' ? i.artist.name : i.artist;
                    // artist mode means i.name is artist otherwise i.artist is artist

                    
                    if (mode === "artist") {
                        return i.name.toLowerCase() === artistName.toLowerCase();
                    } else {
                        // Check artist match first
                        if (iArtist.toLowerCase() !== artistName.toLowerCase()) return false;
                        // Check item name match
                        return i.name.toLowerCase() === itemName.toLowerCase();
                    }
                });

                if (found) stats[period] = parseInt(found.playcount);

             } catch (e) {
                 console.error(`Error fetching period ${period} for ${mode}:`, e);
             }
        };

        // Run in parallel
        await Promise.all([fetchPeriod("7day"), fetchPeriod("1month")]);
        return stats;
    },

    async getInfo(username, mode, artistName, itemName = null) {
        const apiKey = process.env.LASTFM_API_KEY;
        let method = "";
        let params = `&artist=${encodeURIComponent(artistName)}`;
        
        if (mode === "artist") {
            method = "artist.getinfo";
        } else if (mode === "album") {
            method = "album.getinfo";
            params += `&album=${encodeURIComponent(itemName)}`;
        } else if (mode === "track") {
            method = "track.getinfo";
            params += `&track=${encodeURIComponent(itemName)}`;
        }

        // Add username to get userplaycount
        params += `&username=${encodeURIComponent(username)}`;

        const url = `https://ws.audioscrobbler.com/2.0/?method=${method}${params}&api_key=${apiKey}&format=json`;
        
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) throw { code: "LASTFM_ERR", message: data.message };

        // Helper to get best image
        const getBestImage = (images) => {
            if (!images || !Array.isArray(images) || images.length === 0) return null;
            // Return the last image in the array (usually the largest/mega/extralarge)
            const img = images[images.length - 1]["#text"];
            if (!img) return null;
            return img.replace(/\/i\/u\/[a-zA-Z0-9]+\//, "/i/u/_/"); 
        };

        let result = {};
        if (mode === "artist") {
            const info = data.artist;
            result = {
                name: info.name,
                url: info.url,
                playcount: info.stats?.userplaycount || 0,
                globalPlaycount: info.stats?.playcount,
                listeners: info.stats?.listeners,
                tags: info.tags?.tag?.map(t => t.name).join(", ") || "",
                bio: info.bio?.summary || "",
                image: getBestImage(info.image)
            };
        } else if (mode === "album") {
            const info = data.album;
            result = {
                name: info.name,
                artist: info.artist,
                url: info.url,
                playcount: info.userplaycount || 0,
                globalPlaycount: info.playcount,
                listeners: info.listeners,
                image: getBestImage(info.image)
            };
        } else if (mode === "track") {
            const info = data.track;
            // Try album image first, then track image
            const images = info.album?.image || info.image;
            
            result = {
                name: info.name,
                artist: info.artist?.name,
                artistUrl: info.artist?.url,
                url: info.url,
                playcount: info.userplaycount || 0,
                globalPlaycount: info.playcount,
                listeners: info.listeners,
                album: info.album?.title || "",
                image: getBestImage(images)
            };
        }

        // Helper to fetch from iTunes if Last.fm fails
        const fetchItunesCover = async (term) => {
            try {
                const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=1`);
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    // resize to 600x600 or larger
                    return data.results[0].artworkUrl100.replace("100x100", "1000x1000"); 
                }
            } catch (e) {
                console.error("iTunes fetch failed:", e);
            }
            return null;
        };

        // Fallback to iTunes then Genius if image is missing
        if (!result.image) {
            let query = "";
            if (mode === "artist") query = result.name;
            else if (mode === "album") query = `${result.artist} ${result.name}`;
            else if (mode === "track") query = `${result.artist} ${result.name}`;

            if (query) {
                // Try iTunes first
                const itunesImg = await fetchItunesCover(query);
                if (itunesImg) {
                    result.image = itunesImg;
                } else {
                    // Try Genius as second fallback
                     try {
                        const song = await geniusService.searchSong(query);
                        if (song && song.image) {
                            result.image = song.image;
                        }
                    } catch (err) {
                       // ignore
                    }
                }
            }
        }

        return result;
    },

    async getCurrentTrack(username) {
        const apiKey = process.env.LASTFM_API_KEY;
        const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(username)}&api_key=${apiKey}&format=json&limit=1`;
        
        try {
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.error) throw new Error(data.message);
            
            const track = data.recenttracks?.track?.[0];
            if (!track) return null;
            
            return {
                artist: track.artist["#text"] || track.artist.name,
                album: track.album["#text"],
                name: track.name
            };
        } catch (e) {
            console.error("Error fetching current track:", e);
            return null;
        }
    },

    async execute(interactionOrMessage, isSlash, targetUser, mode, queryInput) {
        const apiKey = process.env.LASTFM_API_KEY;
        const loadingEmoji = process.env.lumenLOAD || "⏳";
        const user = targetUser || (isSlash ? interactionOrMessage.user : interactionOrMessage.author);
        
        let responseMessage;

        if (isSlash) {
            if (!interactionOrMessage.deferred && !interactionOrMessage.replied) {
                try {
                    await interactionOrMessage.deferReply();
                } catch (err) {
                    if (err.code === 10062) {
                        console.warn("[WARN] Interaction timed out or was unknown during deferReply in playsfm.");
                        return;
                    }
                    throw err;
                }
            }
        } else {
            responseMessage = await interactionOrMessage.reply({ content: `${loadingEmoji} Fetching plays...` });
        }

        const username = await this.getLastFMUsername(user.id);
        if (!username) {
            const embed = this.buildNoAccountEmbed(user);
            if (isSlash) return interactionOrMessage.editReply({ content: "", embeds: [embed] });
            if (responseMessage) return responseMessage.edit({ content: "", embeds: [embed] });
            return interactionOrMessage.reply({ content: "", embeds: [embed] });
        }

        // Parsing Input
        let artistName = "";
        let itemName = "";

        if (!queryInput) {
            // No input provided, fetch current track
            const currentTrack = await this.getCurrentTrack(username);
            if (!currentTrack) {
                const errEmbed = new EmbedBuilder()
                    .setColor("#ff3300")
                    .setDescription(`Could not find any recent tracks for ${username}. Please provide a query.`);
                
                if (isSlash) return interactionOrMessage.editReply({ content: "", embeds: [errEmbed] });
                if (responseMessage) return responseMessage.edit({ content: "", embeds: [errEmbed] });
                return interactionOrMessage.reply({ content: "", embeds: [errEmbed] });
            }

            if (mode === "artist") {
                artistName = currentTrack.artist;
            } else if (mode === "album") {
                if (!currentTrack.album) {
                     const errEmbed = new EmbedBuilder()
                        .setColor("#ff3300")
                        .setDescription(`Your current/latest track does not have album information. Please specify an album.`);
                    
                    if (isSlash) return interactionOrMessage.editReply({ content: "", embeds: [errEmbed] });
                    if (responseMessage) return responseMessage.edit({ content: "", embeds: [errEmbed] });
                    return interactionOrMessage.reply({ content: "", embeds: [errEmbed] });
                }
                itemName = currentTrack.album;
                artistName = currentTrack.artist;
            } else if (mode === "track") {
                itemName = currentTrack.name;
                artistName = currentTrack.artist;
            }
        
        } else if (queryInput.includes("|||")) {
            // If queryInput contains separator |||, use it
            const parts = queryInput.split("|||");
            artistName = parts[0];
            itemName = parts[1];
        } else {
            // Manual input
            if (mode === "artist") {
                artistName = queryInput;
            } else {
                // split if pipe exists

                if (queryInput.includes("|")) {
                    const parts = queryInput.split("|").map(s => s.trim());
                    itemName = parts[0];
                    artistName = parts[1]; // "Album | Artist"
                } else {
                    // Try to search for it to get the artist
                    // This is a fallback
                    itemName = queryInput;
                    const searchMethod = mode === "album" ? "album.search" : "track.search";
                    try {
                        const sUrl = `https://ws.audioscrobbler.com/2.0/?method=${searchMethod}&${mode}=${encodeURIComponent(itemName)}&api_key=${apiKey}&format=json&limit=1`;
                        const sRes = await fetch(sUrl);
                        const sData = await sRes.json();
                        
                        if (mode === "album") {
                            const match = sData.results?.albummatches?.album?.[0];
                            if (match) artistName = match.artist;
                        } else {
                            const match = sData.results?.trackmatches?.track?.[0];
                            if (match) artistName = match.artist;
                        }
                    } catch (e) {
                        // ignore, will fail later
                    }
                }
            }
        }

        if (mode !== "artist" && !artistName) {
            const errEmbed = new EmbedBuilder()
                .setColor("#ff3300")
                .setDescription(`Could not determine the artist for ${mode} "${itemName}". Please specify it (e.g. \`Name | Artist\`).`);
            
            if (isSlash) return interactionOrMessage.editReply({ content: "", embeds: [errEmbed] });
            if (responseMessage) return responseMessage.edit({ content: "", embeds: [errEmbed] });
            return interactionOrMessage.reply({ content: "", embeds: [errEmbed] });
        }

        try {
            const [info, periodStats] = await Promise.all([
                this.getInfo(username, mode, artistName, itemName),
                this.getPeriodStats(username, mode, artistName, itemName)
            ]);
            
            const embed = new EmbedBuilder()
                .setColor("#2f3136") // Dark mode neutral or use a dominant color logic if we had it
                .setAuthor({
                    name: `${user.username}`,
                    iconURL: user.displayAvatarURL({ dynamic: true })
                })
                .setFooter({ text: `Last.fm • ${mode.charAt(0).toUpperCase() + mode.slice(1)}` })
                .setTimestamp();

            // Image Handling (Buffer for instant load)
            const files = [];
            if (info.image) {
                try {
                    const imgRes = await fetch(info.image);
                    const imgBuffer = await imgRes.arrayBuffer();
                    const buffer = Buffer.from(imgBuffer);
                    
                    // Discord file limit is 25MB standard, but safer to check 8MB or even 10MB to be safe for non-boosted servers
                    if (buffer.byteLength > 8 * 1024 * 1024) { 
                        // Too large, fallback to URL
                        embed.setThumbnail(info.image);
                    } else {
                        const fileName = "cover.png"; 
                        files.push({ attachment: buffer, name: fileName });
                        embed.setThumbnail(`attachment://${fileName}`);
                    }
                } catch (e) {
                    console.error("Failed to buffer image:", e);
                    // Fallback to URL if buffering fails
                     embed.setThumbnail(info.image);
                }
            }

            // Stats Logic
            const userPlays = parseInt(info.playcount).toLocaleString();
            const weekPlays = periodStats["7day"].toLocaleString();
            const monthPlays = periodStats["1month"].toLocaleString();
            
            const globalListeners = parseInt(info.listeners).toLocaleString();
            const globalPlays = parseInt(info.globalPlaycount).toLocaleString();

            if (mode === "artist") {
                embed.setTitle(info.name);
                embed.setURL(info.url);
                embed.addFields(
                    { name: 'Your Plays', value: `All-time: **${userPlays}**\nLast Week: **${weekPlays}**\nLast Month: **${monthPlays}**`, inline: true },
                    { name: 'Global Stats', value: `Listeners: **${globalListeners}**\nScrobbles: **${globalPlays}**`, inline: true }
                );
            } else if (mode === "album") {
                embed.setTitle(`${info.name} - ${info.artist}`);
                embed.setURL(info.url);
                embed.setDescription(null); // Clear description to be clean

                embed.addFields(
                    { name: 'Your Plays', value: `All-time: **${userPlays}**\nLast Week: **${weekPlays}**\nLast Month: **${monthPlays}**`, inline: true },
                    { name: 'Global Stats', value: `Listeners: **${globalListeners}**\nScrobbles: **${globalPlays}**`, inline: true }
                );
            } else if (mode === "track") {
                embed.setTitle(`${info.name} - ${info.artist}`);
                embed.setURL(info.url);
                embed.setDescription(info.album ? `**Album:** ${info.album}` : null);

                embed.addFields(
                    { name: 'Your Plays', value: `All-time: **${userPlays}**\nLast Week: **${weekPlays}**\nLast Month: **${monthPlays}**`, inline: true },
                    { name: 'Global Stats', value: `Listeners: **${globalListeners}**\nScrobbles: **${globalPlays}**`, inline: true }
                );
            }

            if (isSlash) {
                await interactionOrMessage.editReply({ content: "", embeds: [embed], files: files });
            } else {
                 if (responseMessage) {
                     await responseMessage.edit({ content: "", embeds: [embed], files: files });
                 } else {
                     await interactionOrMessage.reply({ content: "", embeds: [embed], files: files });
                 }
            }

        } catch (err) {
            console.error(err);
             const errMsg = err.message === "The artist you supplied could not be found" ? "Artist not found." : "Could not fetch data from Last.fm.";
             const errorEmbed = new EmbedBuilder()
                .setColor("#ff3300")
                .setTitle(`${MUSIC_EMOJI()} Error`)
                .setDescription(errMsg)
                .setTimestamp();
            
            if (isSlash) return interactionOrMessage.editReply({ content: "", embeds: [errorEmbed] });
            if (responseMessage) return responseMessage.edit({ content: "", embeds: [errorEmbed] });
            return interactionOrMessage.reply({ content: "", embeds: [errorEmbed] });
        }
    }
};

const commandData = {
    name: "playsfm",
    aliases: ["pfm", "plays"],
    data: new SlashCommandBuilder()
        .setName("playsfm")
        .setDescription("Check play count for a specific artist, album, or track")
        .addSubcommand(subcommand =>
            subcommand
                .setName("artist")
                .setDescription("Check plays for an artist")
                .addStringOption(option =>
                    option.setName("query")
                        .setDescription("The artist Name")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
                .addUserOption(option =>
                    option.setName("user").setDescription("User to check").setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("album")
                .setDescription("Check plays for an album")
                .addStringOption(option =>
                    option.setName("query")
                        .setDescription("The album name")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
                 .addUserOption(option =>
                    option.setName("user").setDescription("User to check").setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("track")
                .setDescription("Check plays for a track")
                .addStringOption(option =>
                    option.setName("query")
                        .setDescription("The track name")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
                 .addUserOption(option =>
                    option.setName("user").setDescription("User to check").setRequired(false)
                )
        ),
    
    async autocomplete(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const focusedValue = interaction.options.getFocused();
        const suggestions = await playsFMLogic.fetchAutocomplete(subcommand, focusedValue);
        await interaction.respond(suggestions);
    },

    async executeSlash(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const query = interaction.options.getString("query");
        const targetUser = interaction.options.getUser("user") || interaction.user;
        await playsFMLogic.execute(interaction, true, targetUser, subcommand, query);
    },

    async executePrefix(message, args) {
        // Usage: \playsfm <subcommand> <query...> [ | <artist>]
        // args[0] is mode
        const modeMap = {
            "artist": "artist",
            "album": "album",
            "track": "track"
        };
        
        let mode = args[0]?.toLowerCase();
        let targetUser = message.mentions.users.first() || message.author;
        
        if (!mode || !modeMap[mode]) {
             // strict checking for mode

             return message.reply("Usage: `\\playsfm <artist|album|track> <name>`");
        }

        // Remove mode from args
        args.shift();

        // check mentions
        if (message.mentions.users.size > 0) {
            // mentions handled by filter regex later
        }

        // Reconstruct query 
        // We need to filter out the mention text if it exists
        const mentionRegex = /<@!?\d+>/g;
        const queryParts = args.filter(a => !mentionRegex.test(a)); 
        const queryInput = queryParts.join(" ");

        await playsFMLogic.execute(message, false, targetUser, mode, queryInput);
    }
};

module.exports = commandData;

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const SpotifyService = require("../../services/spotify");

const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");
const MUSIC_EMOJI = () => process.env.lumenMUSIC;

function loadDB() {
    if (!fs.existsSync(dataPath)) return { users: {} };
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

const discoveryLogic = {
    async getLastFMUsername(discordId) {
        const db = loadDB();
        return db.users[discordId] || null;
    },

    async binarySearchDiscovery(username, mode, query, options = {}) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) throw { code: "006" };

        try {
            // 1. Get User Info for registration date and total playcount
            const userUrl = `https://ws.audioscrobbler.com/2.0/?method=user.getInfo&user=${encodeURIComponent(username)}&api_key=${apiKey}&format=json`;
            const userRes = await fetch(userUrl);
            const userData = await userRes.json();
            if (userData.error) return { error: userData.message };

            const registeredAt = parseInt(userData.user?.registered?.unixtime);
            if (!registeredAt) return { error: "Could not determine user registration date." };

            // 2. Get Entity Info for total user playcount
            let infoUrl;
            if (mode === "artist") {
                infoUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&username=${encodeURIComponent(username)}&artist=${encodeURIComponent(query)}&api_key=${apiKey}&format=json&autocorrect=1`;
            } else if (mode === "song") {
                infoUrl = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&username=${encodeURIComponent(username)}&track=${encodeURIComponent(query)}&artist=${encodeURIComponent(options.artist || "")}&api_key=${apiKey}&format=json&autocorrect=1`;
            } else if (mode === "album") {
                infoUrl = `https://ws.audioscrobbler.com/2.0/?method=album.getInfo&username=${encodeURIComponent(username)}&album=${encodeURIComponent(query)}&artist=${encodeURIComponent(options.artist || "")}&api_key=${apiKey}&format=json&autocorrect=1`;
            }

            const infoRes = await fetch(infoUrl);
            const infoData = await infoRes.json();
            if (infoData.error) return { error: infoData.message };

            const info = infoData.artist || infoData.track || infoData.album;
            const userPlaycount = parseInt(info.userplaycount || info.stats?.userplaycount) || 0;
            if (userPlaycount === 0) {
                return {
                    name: info.name,
                    artist: info.artist?.name || info.artist || query,
                    userPlaycount: 0,
                    totalPlaycount: parseInt(info.playcount || info.stats?.playcount) || 0,
                    listeners: parseInt(info.listeners || info.stats?.listeners) || 0,
                    url: info.url,
                    image: info.image?.find(img => img.size === "extralarge")?.["#text"] || info.image?.find(img => img.size === "large")?.["#text"]
                };
            }

            // 3. Binary Search for the 24-hour window
            let start = registeredAt;
            let end = Math.floor(Date.now() / 1000);
            const method = mode === "artist" ? "user.getWeeklyArtistChart" : (mode === "album" ? "user.getWeeklyAlbumChart" : "user.getWeeklyTrackChart");

            // Narrow down to ~24 hours
            while (end - start > 86400) {
                const mid = Math.floor(start + (end - start) / 2);
                const chartUrl = `https://ws.audioscrobbler.com/2.0/?method=${method}&user=${encodeURIComponent(username)}&from=${start}&to=${mid}&api_key=${apiKey}&format=json&limit=1000`;
                const chartRes = await fetch(chartUrl);
                const chartData = await chartRes.json();

                const chart = chartData.weeklyartistchart?.artist || chartData.weeklyalbumchart?.album || chartData.weeklytrackchart?.track || [];
                const list = Array.isArray(chart) ? chart : [chart];
                
                const found = list.find(item => item.name.toLowerCase() === info.name.toLowerCase());
                
                if (found) {
                    end = mid;
                } else {
                    start = mid;
                }
                // Small delay to avoid aggressive rate limiting
                await new Promise(r => setTimeout(r, 100));
            }

            // 4. Fetch scrobbles in that window and find the exact first one
            const finalUrl = `https://ws.audioscrobbler.com/2.0/?method=user.getRecentTracks&user=${encodeURIComponent(username)}&from=${start}&to=${end}&api_key=${apiKey}&format=json&limit=200`;
            const finalRes = await fetch(finalUrl);
            const finalData = await finalRes.json();
            const tracks = finalData.recenttracks?.track || [];
            const trackList = Array.isArray(tracks) ? tracks : [tracks];

            // Filter for exact item and take the oldest (last in array usually, but let's sort to be safe)
            const matches = trackList.filter(t => {
                if (mode === "artist") return t.artist["#text"].toLowerCase() === info.name.toLowerCase();
                if (mode === "song") return t.name.toLowerCase() === info.name.toLowerCase() && t.artist["#text"].toLowerCase() === info.artist.name.toLowerCase();
                if (mode === "album") return t.album["#text"].toLowerCase() === info.name.toLowerCase();
                return false;
            }).sort((a, b) => parseInt(a.date.uts) - parseInt(b.date.uts));

            if (matches.length === 0) {
                // Should not happen if binary search worked, but fallback to range display
                return {
                    name: info.name,
                    artist: info.artist?.name || info.artist || query,
                    userPlaycount,
                    firstScrobbleDate: start,
                    isEstimated: true,
                    totalPlaycount: parseInt(info.playcount || info.stats?.playcount) || 0,
                    listeners: parseInt(info.listeners || info.stats?.listeners) || 0,
                    url: info.url,
                    image: info.image?.find(img => img.size === "extralarge")?.["#text"] || info.image?.find(img => img.size === "large")?.["#text"]
                };
            }

            return {
                name: info.name,
                artist: info.artist?.name || info.artist || query,
                userPlaycount,
                firstScrobbleDate: parseInt(matches[0].date.uts),
                firstTrackName: matches[0].name,
                totalPlaycount: parseInt(info.playcount || info.stats?.playcount) || 0,
                listeners: parseInt(info.listeners || info.stats?.listeners) || 0,
                url: info.url,
                image: await (async () => {
                    let img;
                    if (mode === "artist") img = await SpotifyService.getArtistImage(info.name);
                    else if (mode === "song") img = await SpotifyService.getTrackImage(info.name, info.artist.name);
                    else if (mode === "album") img = await SpotifyService.getAlbumImage(info.name, info.artist);
                    
                    if (img) return img;

                    // Fallback to high-res Last.fm logic
                    return ((info.image || info.album?.image)?.find(img => img.size === "mega")?.["#text"] || 
                           (info.image || info.album?.image)?.find(img => img.size === "extralarge")?.["#text"] || 
                           (info.image || info.album?.image)?.find(img => img.size === "large")?.["#text"])?.replace(/\/u\/\d+x\d+\//, "/u/800x800/");
                })()
            };

        } catch (err) {
            console.error("Binary Discovery error:", err);
            return null;
        }
    },

    buildNoAccountEmbed(targetUser) {
        return new EmbedBuilder()
            .setColor("#ff3300")
            .setAuthor({
                name: `${targetUser.username}`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setTitle(`${MUSIC_EMOJI()} No Last.fm Account Linked`)
            .setDescription(`There's no LastFM account associated with ${targetUser}.\nUse \`lastfmsetup\` to connect accounts.`)
            .setTimestamp();
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("discovery")
        .setDescription("View your library stats for an artist, song, or album")
        .addStringOption(option =>
            option.setName("mode")
                .setDescription("What do you want to find?")
                .setRequired(true)
                .addChoices(
                    { name: "Artist", value: "artist" },
                    { name: "Song", value: "song" },
                    { name: "Album", value: "album" }
                )
        )
        .addStringOption(option =>
            option.setName("query")
                .setDescription("The item to search for")
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user to check (optional)")
                .setRequired(false)
        ),

    name: "discovery",
    aliases: ["firstlisten", "found", "stats"],

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const mode = interaction.options.getString("mode") || "artist";
        const apiKey = process.env.LASTFM_API_KEY;

        if (!focusedValue) return interaction.respond([]);

        try {
            let url;
            if (mode === "artist") {
                url = `https://ws.audioscrobbler.com/2.0/?method=artist.search&artist=${encodeURIComponent(focusedValue)}&api_key=${apiKey}&format=json&limit=5`;
            } else if (mode === "song") {
                url = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(focusedValue)}&api_key=${apiKey}&format=json&limit=5`;
            } else if (mode === "album") {
                url = `https://ws.audioscrobbler.com/2.0/?method=album.search&album=${encodeURIComponent(focusedValue)}&api_key=${apiKey}&format=json&limit=5`;
            }

            const res = await fetch(url);
            const data = await res.json();

            let results = [];
            if (mode === "artist") {
                results = data.results?.artistmatches?.artist?.map(a => ({ name: a.name, value: a.name })) || [];
            } else if (mode === "song") {
                results = data.results?.trackmatches?.track?.map(t => ({ name: `${t.name} by ${t.artist}`, value: `${t.name} | ${t.artist}` })) || [];
            } else if (mode === "album") {
                results = data.results?.albummatches?.album?.map(a => ({ name: `${a.name} by ${a.artist}`, value: `${a.name} | ${a.artist}` })) || [];
            }

            await interaction.respond(results.slice(0, 25));
        } catch (err) {
            await interaction.respond([]);
        }
    },

    async executeSlash(interaction) {
        const loadingEmoji = process.env.lumenLOAD;
        const mode = interaction.options.getString("mode");
        let query = interaction.options.getString("query");
        const targetUser = interaction.options.getUser("user") || interaction.user;

        await interaction.deferReply();

        const username = await discoveryLogic.getLastFMUsername(targetUser.id);
        if (!username) {
            return interaction.editReply({ content: "", embeds: [discoveryLogic.buildNoAccountEmbed(targetUser)] });
        }

        let mainQuery = query;
        let artistHint = "";
        const separator = " | ";
        const lastIndex = query.lastIndexOf(separator);
        
        if ((mode === "song" || mode === "album") && lastIndex !== -1) {
            mainQuery = query.substring(0, lastIndex);
            artistHint = query.substring(lastIndex + separator.length);
        }

        const result = await discoveryLogic.binarySearchDiscovery(username, mode, mainQuery, { artist: artistHint });

        if (!result || result.error) {
            return interaction.editReply({ content: result?.error || `${MUSIC_EMOJI()} Could not find any library data for **${query}**.` });
        }

        const embed = new EmbedBuilder()
            .setColor("#ff6600")
            .setAuthor({
                name: `${targetUser.username}'s First Discovery`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setTitle(`${MUSIC_EMOJI()} ${result.name}`)
            .setURL(result.url)
            .addFields(
                { name: "First Listened", value: result.firstScrobbleDate ? `<t:${result.firstScrobbleDate}:F> (<t:${result.firstScrobbleDate}:R>)` : "Unknown", inline: false }
            )
            .setTimestamp();

        if (mode !== "artist") {
            embed.addFields({ name: "Artist", value: result.artist, inline: false });
        }

        if (result.image) {
            embed.setThumbnail(result.image);
        }

        if (result.userPlaycount === 0) {
            embed.setDescription("*You haven't scrobbled this item yet.*");
        } else {
            embed.setDescription(`You have scrobbled this **${result.userPlaycount.toLocaleString()}** times.`);
        }

        await interaction.editReply({ content: "", embeds: [embed] });
    },

    async executePrefix(message, args) {
        const loadingEmoji = process.env.lumenLOAD;
        const targetUser = message.mentions.users.first() || message.author;
        
        if (!args[0]) {
            return message.reply("Usage: `\\discovery [artist/song/album] [query]`");
        }

        const mode = args[0].toLowerCase();
        if (!["artist", "song", "album"].includes(mode)) {
            return message.reply("Invalid mode! Use `artist`, `song`, or `album`.");
        }

        const query = args.slice(1).join(" ");
        if (!query) {
            return message.reply(`Please provide a ${mode} name to search for.`);
        }

        const sent = await message.reply(`${loadingEmoji} Fetching library data...`);

        const username = await discoveryLogic.getLastFMUsername(targetUser.id);
        if (!username) {
            return sent.edit({ content: "", embeds: [discoveryLogic.buildNoAccountEmbed(targetUser)] });
        }

        // Prefix command doesn't have the " | " hint usually, so we just pass query
        const result = await discoveryLogic.binarySearchDiscovery(username, mode, query);

        if (!result || result.error) {
            return sent.edit({ content: result?.error || `${MUSIC_EMOJI()} Could not find any library data for **${query}**.` });
        }

        const embed = new EmbedBuilder()
            .setColor("#ff6600")
            .setAuthor({
                name: `${targetUser.username}'s First Discovery`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setTitle(`${MUSIC_EMOJI()} ${result.name}`)
            .setURL(result.url)
            .addFields(
                { name: "First Listened", value: result.firstScrobbleDate ? `<t:${result.firstScrobbleDate}:F> (<t:${result.firstScrobbleDate}:R>)` : "Unknown", inline: false }
            )
            .setTimestamp();

        if (mode !== "artist") {
            embed.addFields({ name: "Artist", value: result.artist, inline: false });
        }

        if (result.image) {
            embed.setThumbnail(result.image);
        }

        if (result.userPlaycount === 0) {
            embed.setDescription("*You haven't scrobbled this item yet.*");
        } else {
            embed.setDescription(`You have scrobbled this **${result.userPlaycount.toLocaleString()}** times.`);
        }

        await sent.edit({ content: "", embeds: [embed] });
    }
};

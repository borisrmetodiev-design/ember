const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const path = require("path");
const { signParams } = require("../../utils/lastfmHelper");
const SpotifyService = require("../../services/spotify");
const { readJSON } = require("../../utils/database");

const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");
const MUSIC_EMOJI = () => process.env.lumenMUSIC;

async function loadDB() {
    const data = await readJSON(dataPath);
    return data.users ? data : { users: {} };
}

const discoveryLogic = {
    async getLastFMCredentials(discordId) {
        const db = await loadDB();
        const user = db.users[discordId];
        if (!user) return null;
        if (typeof user === 'string') return { username: user, sk: null };
        return { username: user.username, sk: user.sk };
    },

    async binarySearchDiscovery(creds, mode, query, options = {}) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) throw { code: "006" };
        
        const { username, sk } = creds;



        const getUrl = (method, extraParams = {}) => {
            let params = {
                method,
                api_key: apiKey,
                format: "json",
                ...extraParams
            };
            if (sk) {
                params.user = username;
                params.sk = sk;
                delete params.api_key; 
                params = signParams(params);
            } else {
                 if (!params.user && !params.artist) params.user = username;
            }
            // build url with params
            return `https://ws.audioscrobbler.com/2.0/?${new URLSearchParams(params).toString()}`;
        };

        try {
            // 1. Get User Info
            const userUrl = getUrl("user.getInfo", { user: username }); // user.getInfo uses 'user'
            const userRes = await fetch(userUrl);
            const userData = await userRes.json();

            if (userData.error) {
                if (userData.error === 17) return { error: "This user's Last.fm privacy settings hide their stats." };
                return { error: userData.message };
            }

            const registeredAt = parseInt(userData.user?.registered?.unixtime);
            if (!registeredAt) return { error: "Could not determine user registration date." };

            // 2. Get Entity Info
            let infoParams = { username }; // Context for userplaycount
            if (mode === "artist") {
                infoParams.artist = query;
                infoParams.autocorrect = 1;
            } else if (mode === "song") {
                infoParams.track = query;
                infoParams.artist = options.artist || "";
                infoParams.autocorrect = 1;
            } else if (mode === "album") {
                infoParams.album = query;
                infoParams.artist = options.artist || "";
                infoParams.autocorrect = 1;
            }
            
            // get info depending on mode
            // lastfm api is weird inconsistent so adjust params carefully
            
            // Rewrite getUrl to be more flexible
            const buildSignedUrl = (method, params) => {
                 const p = { method, format: "json", ...params };
                 if (sk) {
                     p.sk = sk;
                     return `https://ws.audioscrobbler.com/2.0/?${new URLSearchParams(signParams(p)).toString()}`;
                 } else {
                     p.api_key = apiKey;
                     return `https://ws.audioscrobbler.com/2.0/?${new URLSearchParams(p).toString()}`;
                 }
            };

            // 1. User Info Reprise
            const userRes2 = await fetch(buildSignedUrl("user.getInfo", { user: username }));
            const userData2 = await userRes2.json();
             if (userData2.error) {
                if (userData2.error === 17) return { error: "This user's Last.fm privacy settings hide their stats." };
                return { error: userData2.message };
            }
            const registeredAt2 = parseInt(userData2.user?.registered?.unixtime);


            // 2. Entity Info
            let entityMethod = mode === "artist" ? "artist.getInfo" : (mode === "album" ? "album.getInfo" : "track.getInfo");
            let entityParams = { username }; // Context
            if (mode === "artist") entityParams.artist = query;
            else if (mode === "song") { entityParams.track = query; entityParams.artist = options.artist || ""; }
            else { entityParams.album = query; entityParams.artist = options.artist || ""; }
            entityParams.autocorrect = 1;

            const infoRes = await fetch(buildSignedUrl(entityMethod, entityParams));
            const infoData = await infoRes.json();
            if (infoData.error) {
                 if (infoData.error === 17) return { error: "This user's Last.fm privacy settings hide their stats." };
                 return { error: infoData.message };
            }

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

            // 3. Binary Search
            let start = registeredAt2;
            let end = Math.floor(Date.now() / 1000);
            const chartMethod = mode === "artist" ? "user.getWeeklyArtistChart" : (mode === "album" ? "user.getWeeklyAlbumChart" : "user.getWeeklyTrackChart");

            while (end - start > 86400) {
                const mid = Math.floor(start + (end - start) / 2);
                const chartParams = { user: username, from: start, to: mid, limit: 1000 };
                
                const chartRes = await fetch(buildSignedUrl(chartMethod, chartParams));
                const chartData = await chartRes.json();

                const chart = chartData.weeklyartistchart?.artist || chartData.weeklyalbumchart?.album || chartData.weeklytrackchart?.track || [];
                const list = Array.isArray(chart) ? chart : [chart];
                
                const found = list.find(item => item.name.toLowerCase() === info.name.toLowerCase());
                
                if (found) {
                    end = mid;
                } else {
                    start = mid;
                }
                await new Promise(r => setTimeout(r, 100)); // Rate limit
            }

            // 4. Fetch scrobbles
            const recentParams = {
                user: username,
                from: start,
                to: end,
                limit: 200
            };
            const finalRes = await fetch(buildSignedUrl("user.getRecentTracks", recentParams));
            const finalData = await finalRes.json();
            const tracks = finalData.recenttracks?.track || [];
            const trackList = Array.isArray(tracks) ? tracks : [tracks];

            // filter matches and sort by date
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

        try {
            await interaction.deferReply();
        } catch (err) {
             if (err.code === 10062) {
                console.warn("[WARN] Interaction timed out during deferReply in discovery.");
                return;
            }
            throw err;
        }

        const creds = await discoveryLogic.getLastFMCredentials(targetUser.id);
        if (!creds) {
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

        const result = await discoveryLogic.binarySearchDiscovery(creds, mode, mainQuery, { artist: artistHint });

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

        const creds = await discoveryLogic.getLastFMCredentials(targetUser.id);
        if (!creds) {
            return sent.edit({ content: "", embeds: [discoveryLogic.buildNoAccountEmbed(targetUser)] });
        }

        // Prefix command doesn't have the " | " hint usually, so we just pass query
        const result = await discoveryLogic.binarySearchDiscovery(creds, mode, query);

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

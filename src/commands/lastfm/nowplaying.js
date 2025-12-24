const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

// Node-fetch v3 ESM-compatible import for CommonJS
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

// Cache for Spotify token
let spotifyTokenCache = {
    token: null,
    expiresAt: 0
};

async function getSpotifyToken() {
    // Return cached token if still valid
    if (spotifyTokenCache.token && Date.now() < spotifyTokenCache.expiresAt) {
        return spotifyTokenCache.token;
    }

    const clientId = process.env.SPOTIFY_ID;
    const clientSecret = process.env.SPOTIFY_SECRET;

    if (!clientId || !clientSecret) {
        console.log("No Spotify credentials found, skipping token fetch");
        return null;
    }

    try {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            console.log(`Failed to get Spotify token: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        
        // Cache the token (expires in 1 hour, we'll refresh 5 min early)
        spotifyTokenCache.token = data.access_token;
        spotifyTokenCache.expiresAt = Date.now() + ((data.expires_in - 300) * 1000);
        
        console.log("✅ Successfully generated new Spotify access token");
        return data.access_token;
    } catch (err) {
        console.error("Error getting Spotify token:", err.message);
        return null;
    }
}

async function fetchSpotifyArtwork(trackName, artistName) {
    try {
        const token = await getSpotifyToken();
        if (!token) {
            console.log("No Spotify token available, skipping artwork fetch");
            return null;
        }

        const url = `https://api.spotify.com/v1/search?q=track:${encodeURIComponent(trackName)} artist:${encodeURIComponent(artistName)}&type=track&limit=1`;

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!res.ok) {
            console.log(`Spotify API error: ${res.status} ${res.statusText}`);
            return null;
        }

        const data = await res.json();

        const images = data.tracks?.items[0]?.album?.images;
        const imageUrl = images?.[0]?.url || null;
        
        if (imageUrl) {
            console.log(`✅ Found Spotify artwork for: ${trackName} by ${artistName}`);
        } else {
            console.log(`❌ No Spotify artwork found for: ${trackName} by ${artistName}`);
        }
        
        return imageUrl; // largest image (usually 640–800px)
    } catch (err) {
        console.error("Error fetching Spotify artwork:", err.message);
        return null;
    }
}

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");

// Animated emoji
const MUSIC_EMOJI = "<a:emberMUSIC:1452939837203152896>";

function loadDB() {
    if (!fs.existsSync(dataPath)) return { users: {} };
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("nowplaying")
        .setDescription("Shows the current or last played track from Last.fm")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The user to check (optional)")
                .setRequired(false)
        ),

    name: "nowplaying",
    aliases: ["np", "fm", "nowplaying"],

    async getLastFMUsername(discordId) {
        const db = loadDB();
        return db.users[discordId] || null;
    },

    async fetchNowPlaying(username) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) throw { code: "006" }; // LastFM API authentication failed

        try {
            // Get most recent track
            const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(
                username
            )}&api_key=${apiKey}&format=json&limit=1`;

            const res = await fetch(url);
            const data = await res.json();

            if (!data.recenttracks || !data.recenttracks.track || data.recenttracks.track.length === 0) {
                throw { code: "020" }; // No track data found at all
            }

            const track = data.recenttracks.track[0];

            // Fetch playcount
            const infoUrl = `https://ws.audioscrobbler.com/2.0/?method=track.getinfo&api_key=${apiKey}&artist=${encodeURIComponent(
                track.artist["#text"]
            )}&track=${encodeURIComponent(track.name)}&username=${encodeURIComponent(
                username
            )}&format=json`;

            const infoRes = await fetch(infoUrl);
            const infoData = await infoRes.json();

            const playcount = infoData.track?.userplaycount || 0;

            return {
                track,
                playcount,
                isNowPlaying: track["@attr"]?.nowplaying === "true",
                playedAt: track.date?.uts ? new Date(track.date.uts * 1000) : null
            };
        } catch (err) {
            if (err.code) throw err;
            throw { code: "005", err }; // LastFM data fetch failed
        }
    },

    buildNoAccountEmbed(targetUser) {
        return new EmbedBuilder()
            .setColor("#ff3300")
            .setAuthor({
                name: `${targetUser.username}`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setTitle(`${MUSIC_EMOJI} No Last.fm Account Linked`)
            .setDescription(
                `There's no LastFM account associated with ${targetUser}.\n` +
                `Please run the \`lastfmsetup\` command to connect accounts.`
            )
            .setFooter({ text: "Ember Status — Last.fm" })
            .setTimestamp();
    },

    async buildTrackEmbed(info, targetUser, username) {
        const { track, playcount, isNowPlaying, playedAt } = info;

        const artist = track.artist["#text"];
        const name = track.name;
        const album = track.album["#text"] || "Unknown Album";
        const spotifyImage = await fetchSpotifyArtwork(name, artist);

        const trackUrl = track.url || null;
        const artistUrl = `https://www.last.fm/music/${encodeURIComponent(artist)}`;
        const albumUrl = `https://www.last.fm/music/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`;

        // Header text with timestamp
        let headerText;
        if (isNowPlaying) {
            headerText = `${MUSIC_EMOJI} Now Playing`;
        } else {
            const playedAgo = playedAt ? `<t:${Math.floor(playedAt.getTime() / 1000)}:R>` : "Unknown time";
            headerText = `${MUSIC_EMOJI} Last Played • ${playedAgo}`;
        }

        const embed = new EmbedBuilder()
            .setColor("#ff6600")
            .setAuthor({
                name: `${targetUser.username}`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setTitle(headerText)
            .addFields(
                {
                    name: "Song",
                    value: trackUrl ? `[${name}](${trackUrl})` : name,
                    inline: true
                },
                {
                    name: "Artist",
                    value: `[${artist}](${artistUrl})`,
                    inline: true
                },
                {
                    name: "Album",
                    value: `[${album}](${albumUrl})`,
                    inline: true
                },
            )
            .setFooter({
                text: `Played: ${playcount} times • ${username}`
            })
            .setTimestamp();

        if (spotifyImage) embed.setThumbnail(spotifyImage);

        return embed;
    },

    async executeSlash(interaction) {
        try {
            const loadingEmoji = process.env.emberLOAD;
            const targetUser = interaction.options.getUser("user") || interaction.user;

            await interaction.reply({
                content: `${loadingEmoji} Fetching Last.fm data...`,
                ephemeral: false
            });

            const username = await this.getLastFMUsername(targetUser.id);

            if (!username) {
                return interaction.editReply({
                    content: "",
                    embeds: [this.buildNoAccountEmbed(targetUser)]
                });
            }

            const info = await this.fetchNowPlaying(username);

            const embed = await this.buildTrackEmbed(info, targetUser, username);

            const sent = await interaction.editReply({
                content: "",
                embeds: [embed]
            });

            if (interaction.guild) {
                try {
                    await sent.react("👍");
                    await sent.react("👎");
                } catch (e) {
                    console.error("Failed to add reactions:", e);
                }
            }
        } catch (err) {
            throw err.code ? err : { code: "005", err };
        }
    },

    async executePrefix(message, args) {
        try {
            const loadingEmoji = process.env.emberLOAD;
            const targetUser = message.mentions.users.first() || message.author;

            const sent = await message.reply(`${loadingEmoji} Fetching Last.fm data...`);

            const username = await this.getLastFMUsername(targetUser.id);

            if (!username) {
                return sent.edit({
                    content: "",
                    embeds: [this.buildNoAccountEmbed(targetUser)]
                });
            }

            const info = await this.fetchNowPlaying(username);

            const embed = await this.buildTrackEmbed(info, targetUser, username);

            const edited = await sent.edit({
                content: "",
                embeds: [embed]
            });

            if (message.guild) {
                try {
                    await edited.react("👍");
                    await edited.react("👎");
                } catch (e) {
                    console.error("Failed to add reactions:", e);
                }
            }
        } catch (err) {
            throw err.code ? err : { code: "005", err };
        }
    }
};
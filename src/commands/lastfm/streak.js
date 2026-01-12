const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const SpotifyService = require("../../services/spotify");

// Node-fetch v3 ESM-compatible import for CommonJS
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");
const streaksPath = path.join(__dirname, "../../storage/data/streaks.json");

const MUSIC_EMOJI = () => process.env.lumenMUSIC || "🎵";

function loadDB() {
    if (!fs.existsSync(dataPath)) return { users: {} };
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function loadStreaks() {
    if (!fs.existsSync(streaksPath)) return {};
    return JSON.parse(fs.readFileSync(streaksPath, "utf8"));
}

function saveStreaks(data) {
    fs.writeFileSync(streaksPath, JSON.stringify(data, null, 4));
}

const streakLogic = {
    async getLastFMUsername(discordId) {
        const db = loadDB();
        return db.users[discordId] || null;
    },

    async fetchRecentTracks(username, limit = 1000) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) throw { code: "006" };

        const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(
            username
        )}&api_key=${apiKey}&format=json&limit=${limit}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.error) throw { code: "019", message: data.message };
        return data.recenttracks.track || [];
    },

    async getArtistPlays(username, artistName) {
        const apiKey = process.env.LASTFM_API_KEY;
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(
            artistName
        )}&username=${encodeURIComponent(username)}&api_key=${apiKey}&format=json`;
        
        const res = await fetch(url);
        const data = await res.json();
        return data.artist?.stats?.userplaycount || 0;
    },

    // Identify the target artist: optionally provided or the most recent one
    getTargetArtist(tracks, providedArtist) {
        if (providedArtist) return providedArtist;
        if (!tracks || tracks.length === 0) return null;
        // Return most recent track's artist
        return tracks[0].artist["#text"];
    },

    calculateStreak(tracks, artistName) {
        if (!tracks || tracks.length === 0) return { currentStreak: 0, startDate: null };

        let streak = 0;
        let startDate = null;

        // Iterate through recent tracks to count consecutive plays of the artist
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            const trackArtist = track.artist["#text"];

            if (trackArtist.toLowerCase() === artistName.toLowerCase()) {
                streak++;
                // Update start date to the current track's date (going backwards in time)
                // If nowplaying track has no date, skip setting startDate for it (handled by next track or stays null if nowplaying is the only one)
                if (track.date && track.date.uts) {
                    startDate = new Date(track.date.uts * 1000);
                } else if (!startDate && i === tracks.length - 1) {
                    // Fallback for startDate if only 1 track and it's now playing (no date)?
                    // Usually we want the *start* of the streak. If single track is now playing, start date is roughly now.
                    startDate = new Date(); 
                }
            } else {
                // Streak broken
                break;
            }
        }

        // If 'now playing' track (index 0) has no date, startDate might have been set by index 1, which is correct (earliest track).
        // If streak is 1 and it's 'now playing', startDate might be null from loop if we strictly relied on track.date.
        if (streak > 0 && !startDate) {
             startDate = new Date();
        }

        return { currentStreak: streak, startDate };
    },

    async execute(interactionOrMessage, isSlash, targetUser, artistInput) {
        const loadingEmoji = process.env.lumenLOAD || "⏳";
        const user = targetUser || (isSlash ? interactionOrMessage.user : interactionOrMessage.author);

        let response;
        if (isSlash) {
            if (!interactionOrMessage.deferred && !interactionOrMessage.replied) {
                try {
                await interactionOrMessage.deferReply();
                } catch (err) { return; }
            }
        } else {
            response = await interactionOrMessage.reply({ content: `${loadingEmoji} Fetching streak data...` });
        }

        const username = await this.getLastFMUsername(user.id);

        if (!username) {
            const embed = new EmbedBuilder()
                .setColor("#ff3300")
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
                .setTitle(`${MUSIC_EMOJI()} No Last.fm Account`)
                .setDescription("Please use `lastfmsetup` to link your account.");
            return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [embed] }) : response.edit({ content: "", embeds: [embed] });
        }

        const tracks = await this.fetchRecentTracks(username);
        const artistName = this.getTargetArtist(tracks, artistInput);

        if (!artistName) {
            const embed = new EmbedBuilder()
                .setColor("#ff3300")
                .setDescription("Could not determine an artist to check.");
             return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [embed] }) : response.edit({ content: "", embeds: [embed] });
        }

        const { currentStreak, startDate } = this.calculateStreak(tracks, artistName);
        const playCount = await this.getArtistPlays(username, artistName);
        const artistImage = await SpotifyService.getArtistImage(artistName);

        // Save/Update Streak logic (Mocked or Real)
        // We will store the max streak seen or just current
        const allStreaks = loadStreaks();
        if (!allStreaks[user.id]) allStreaks[user.id] = {};
        allStreaks[user.id][artistName] = currentStreak; // Store current
        saveStreaks(allStreaks);

        // Formatting Start Date
        let dateString = "Unknown";
        if (startDate) {
            // "predi 4 dni" style or relative discord timestamp
            const diffTime = Math.abs(new Date() - startDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            // If current streak is 1, it started today (0 days ago) or yesterday (1 day ago)?
            // We use Discord relative time
            dateString = `<t:${Math.floor(startDate.getTime()/1000)}:R>`;
        }
        
        // Determine header
        // "leon's streak overview"
        
        let description = `Artist: **[${artistName}](https://last.fm/music/${encodeURIComponent(artistName)})** - ${currentStreak} plays`;
        
        if (currentStreak > 0 && startDate) {
             description += `\n\nStreak started ${dateString}.`;
        } else if (currentStreak === 0) {
             description += `\n\nNo active streak for this artist.`;
        }

        const embed = new EmbedBuilder()
            .setColor("#ff6600")
            .setAuthor({ 
                name: `${user.username}'s streak overview`, 
                iconURL: user.displayAvatarURL({ dynamic: true }) 
            })
            // No emoji in description as requested
            .setDescription(description)
            .setTimestamp();

        if (artistImage) embed.setThumbnail(artistImage);

        return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [embed] }) : response.edit({ content: "", embeds: [embed] });
    }
};

const commandData = {
    name: "streak",
    aliases: ["st"],
    data: new SlashCommandBuilder()
        .setName("streak")
        .setDescription("Shows your listening streak for an artist")
        .addStringOption(option =>
            option.setName("artist")
                .setDescription("The artist to check (optional)")
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName("user")
                .setDescription("User to check")
                .setRequired(false)
        ),

    async executeSlash(interaction) {
        const artist = interaction.options.getString("artist");
        const targetUser = interaction.options.getUser("user") || interaction.user;
        await streakLogic.execute(interaction, true, targetUser, artist);
    },

    async executePrefix(message, args) {
        // \streak [artist] or \streak [user] [artist]... logic is tricky with names.
        // Simple parsing: if first arg is user mention, use it. Rest is artist.
        // If not user mention, all is artist.
        
        let targetUser = message.mentions.users.first() || message.author;
        let artistInput = args.join(" ");
        
        if (message.mentions.users.size > 0) {
           // Remove mention from string
           artistInput = artistInput.replace(/<@!?[0-9]+>/g, "").trim();
        }
        
        if (artistInput.length === 0) artistInput = null;

        await streakLogic.execute(message, false, targetUser, artistInput);
    }
};

module.exports = commandData;

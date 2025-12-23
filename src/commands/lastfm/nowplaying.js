const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

// Node-fetch v3 ESM-compatible import for CommonJS
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

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

        // Get most recent track
        const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(
            username
        )}&api_key=${apiKey}&format=json&limit=1`;

        const res = await fetch(url);
        const data = await res.json();

        if (!data.recenttracks || !data.recenttracks.track) return null;

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
        const image = track.image?.[3]?.["#text"] || null;

        const trackUrl = track.url || null;
        const artistUrl = `https://www.last.fm/music/${encodeURIComponent(artist)}`;
        const albumUrl = `https://www.last.fm/music/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`;

        // Header text with timestamp
        let headerText;
        if (isNowPlaying) {
            headerText = `${MUSIC_EMOJI} Now Playing`;
        } else {
            const playedAgo = `<t:${Math.floor(playedAt.getTime() / 1000)}:R>`;
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

        if (image) embed.setThumbnail(image);

        return embed;
    },

    async executeSlash(interaction) {
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
        if (!info) {
            return interaction.editReply("Could not fetch Last.fm data.");
        }

        const embed = await this.buildTrackEmbed(info, targetUser, username);

        const sent = await interaction.editReply({
            content: "",
            embeds: [embed]
        });

        // 👍 👎 reactions if in a guild
        if (interaction.guild) {
            try {
                await sent.react("👍");
                await sent.react("👎");
            } catch (e) {
                console.error("Failed to add reactions:", e);
            }
        }
    },

    async executePrefix(message, args) {
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
        if (!info) {
            return sent.edit("Could not fetch Last.fm data.");
        }

        const embed = await this.buildTrackEmbed(info, targetUser, username);

        const edited = await sent.edit({
            content: "",
            embeds: [embed]
        });

        // 👍 👎 reactions if in a guild
        if (message.guild) {
            try {
                await edited.react("👍");
                await edited.react("👎");
            } catch (e) {
                console.error("Failed to add reactions:", e);
            }
        }
    }
};
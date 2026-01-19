
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const SpotifyService = require("../../services/spotify");
const { signParams } = require("../../utils/lastfmHelper");

// Node-fetch v3 ESM-compatible import for CommonJS
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");
const MUSIC_EMOJI = () => process.env.lumenMUSIC;

function loadDB() {
    if (!fs.existsSync(dataPath)) return { users: {} };
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

const customizationPath = path.join(__dirname, "../../storage/data/npCustomization.json");

function loadCustomization(userId, guildId) {
    try {
        if (!fs.existsSync(customizationPath)) return { up: "👍", down: "👎" };
        const db = JSON.parse(fs.readFileSync(customizationPath, "utf8"));
        const userPrefs = db.users[userId];
        if (!userPrefs) return { up: "👍", down: "👎" };

        // Priority: Server-specific > Global > Default
        if (guildId && userPrefs.guilds && userPrefs.guilds[guildId]) {
            return userPrefs.guilds[guildId];
        }
        if (userPrefs.global) {
            return userPrefs.global;
        }
    } catch (err) {
        console.error("Error loading customization:", err);
    }
    return { up: "👍", down: "👎" };
}

const nowplayingLogic = {
    async getLastFMCredentials(discordId) {
        const db = loadDB();
        const user = db.users[discordId];
        if (!user) return null;
        if (typeof user === 'string') return { username: user, sk: null };
        return { username: user.username, sk: user.sk };
    },

    async fetchNowPlaying(creds) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) throw { code: "006" };

        try {
            const { username, sk } = creds;
            let params = {
                method: "user.getrecenttracks",
                user: username,
                limit: 1,
                format: "json"
            };

            if (sk) {
                params.sk = sk;
                params = signParams(params); 
            } else {
                params.api_key = apiKey;
            }

            // Construct URL from params
            const queryString = new URLSearchParams(params).toString();
            const url = `https://ws.audioscrobbler.com/2.0/?${queryString}`;

            const res = await fetch(url);
            const data = await res.json();

            if (data.error) {
                if (data.error === 17) throw { code: "022" };
                throw { code: "005", err: data.message };
            }

            if (!data.recenttracks || !data.recenttracks.track || data.recenttracks.track.length === 0) {
                throw { code: "020" };
            }

            const track = data.recenttracks.track[0];
            // info request usually doesn't need auth unless private? 
            // track.getinfo usually works publicly unless user specific fields needed.
            // But if user is private, maybe track.getinfo needs auth too for userplaycount?
            // "Use the authentication to get the user's playcount"
            // So we should sign this too if possible.
            
            let infoParams = {
                method: "track.getinfo",
                artist: track.artist["#text"],
                track: track.name,
                username: username,
                format: "json"
            };
             if (sk) {
                infoParams.sk = sk;
                infoParams = signParams(infoParams);
            } else {
                infoParams.api_key = apiKey;
            }
            
            const infoQuery = new URLSearchParams(infoParams).toString();
            const infoUrl = `https://ws.audioscrobbler.com/2.0/?${infoQuery}`;

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
            throw { code: "005", err };
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
            .setDescription(
                `There's no LastFM account associated with ${targetUser}.\n` +
                `Please run the \`lastfmsetup\` command to connect accounts.`
            )
            .setTimestamp();
    },

    async buildTrackEmbed(info, targetUser, username) {
        const { track, playcount, isNowPlaying, playedAt } = info;
        const artist = track.artist["#text"];
        const name = track.name;
        const album = track.album["#text"] || "Unknown Album";
        const spotifyImage = await SpotifyService.getTrackImage(name, artist);

        const trackUrl = track.url || null;
        const artistUrl = `https://www.last.fm/music/${encodeURIComponent(artist)}`;
        const albumUrl = `https://www.last.fm/music/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`;

        let headerText;
        if (isNowPlaying) {
            headerText = `${MUSIC_EMOJI()} Now Playing`;
        } else {
            const playedAgo = playedAt ? `<t:${Math.floor(playedAt.getTime() / 1000)}:R>` : "Unknown time";
            headerText = `${MUSIC_EMOJI()} Last Played • ${playedAgo}`;
        }

        const embed = new EmbedBuilder()
            .setColor("#ff6600")
            .setAuthor({
                name: `${targetUser.username}`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setTitle(headerText)
            .addFields(
                { name: "Song", value: trackUrl ? `[${name}](${trackUrl})` : name, inline: true },
                { name: "Artist", value: `[${artist}](${artistUrl})`, inline: true },
                { name: "Album", value: `[${album}](${albumUrl})`, inline: true },
            )
            .setTimestamp();

        if (spotifyImage) embed.setThumbnail(spotifyImage);
        return embed;
    },

    async execute(interactionOrMessage, isSlash, targetUser) {
        const loadingEmoji = process.env.lumenLOAD;
        const user = targetUser || (isSlash ? interactionOrMessage.user : interactionOrMessage.author);
        
        let response;
        if (isSlash) {
            if (!interactionOrMessage.deferred && !interactionOrMessage.replied) {
                try {
                    await interactionOrMessage.deferReply();
                } catch (err) {
                    if (err.code === 10062) {
                         console.warn("[WARN] Interaction timed out during deferReply in nowplaying.");
                         return;
                    }
                    console.error("Failed to defer reply for nowplaying:", err.message);
                    return; // Stop execution if defer failed
                }
            }
        } else {
            response = await interactionOrMessage.reply({ content: `${loadingEmoji} Fetching Last.fm data...` });
        }

        const creds = await this.getLastFMCredentials(user.id);

        if (!creds) {
            const embed = this.buildNoAccountEmbed(user);
            return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [embed] }) : response.edit({ content: "", embeds: [embed] });
        }

        const info = await this.fetchNowPlaying(creds);
        const embed = await this.buildTrackEmbed(info, user, creds.username);
        
        const finalMessage = isSlash ? await interactionOrMessage.editReply({ content: "", embeds: [embed] }) : await response.edit({ content: "", embeds: [embed] });

        // Add reactions
        try {
            const guildId = isSlash ? interactionOrMessage.guildId : interactionOrMessage.guild?.id;
            const { up, down } = loadCustomization(user.id, guildId);
            
            // Re-fetch message if it's a prefix response to ensure we have the message object
            const msg = isSlash ? finalMessage : (finalMessage.id ? finalMessage : await interactionOrMessage.channel.messages.fetch(finalMessage.id));
            
            await msg.react(up).catch(() => {});
            await msg.react(down).catch(() => {});
        } catch (err) {
            console.error("Failed to add reactions to nowplaying:", err);
        }

        return finalMessage;
    }
};

const commandNames = ["np", "fm", "nowplaying"];

module.exports = commandNames.map(name => ({
    data: new SlashCommandBuilder()
        .setName(name)
        .setDescription(`Shows the current or last played track from Last.fm (${name})`)
        .addUserOption(option =>
            option.setName("user").setDescription("The user to check (optional)").setRequired(false)
        ),
    name: name,
    aliases: commandNames.filter(n => n !== name),
    async executeSlash(interaction) {
        try {
            const targetUser = interaction.options.getUser("user") || interaction.user;
            await nowplayingLogic.execute(interaction, true, targetUser);
        } catch (err) {
            throw err.code ? err : { code: "005", err };
        }
    },
    async executePrefix(message, args) {
        try {
            const targetUser = message.mentions.users.first() || message.author;
            await nowplayingLogic.execute(message, false, targetUser);
        } catch (err) {
            throw err.code ? err : { code: "005", err };
        }
    }
}));

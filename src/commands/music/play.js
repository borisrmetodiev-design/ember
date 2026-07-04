// /play — resolve and enqueue tracks from YouTube, Spotify, or SoundCloud
// Matches Ember bot command style: { data, name, aliases, executeSlash, executePrefix }

const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const MusicService  = require("../../services/music/MusicService");
const SearchService = require("../../services/music/SearchService");
const QueueService  = require("../../services/music/QueueService");

const {
    buildTrackAddedEmbed,
    buildPlaylistAddedEmbed,
    buildMusicErrorEmbed,
} = require("../../utils/music/embeds");

const { EMOJIS } = require("../../utils/music/constants");

// ─── Shared logic ─────────────────────────────────────────────────────────────

async function executePlay(context, isSlash, query) {
    const guild   = isSlash ? context.guild : context.guild;
    const user    = isSlash ? context.user  : context.author;
    const member  = isSlash ? context.member : context.member;

    if (!guild) {
        const embed = buildMusicErrorEmbed("This command can only be used in a server.");
        return isSlash
            ? context.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
            : context.reply({ embeds: [embed] });
    }

    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) {
        const embed = buildMusicErrorEmbed("You need to be in a voice channel to play music.");
        return isSlash
            ? context.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
            : context.reply({ embeds: [embed] });
    }

    if (!query || !query.trim()) {
        const embed = buildMusicErrorEmbed("Please provide a song name or URL to play.");
        return isSlash
            ? context.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
            : context.reply({ embeds: [embed] });
    }

    const textChannel = isSlash ? context.channel : context.channel;
    const loadingEmoji = EMOJIS.LOAD;

    // Defer / loading message
    let sentMsg = null;
    if (isSlash) {
        if (!context.deferred && !context.replied) {
            await context.deferReply().catch(() => {});
        }
    } else {
        sentMsg = await context.reply({ content: `${loadingEmoji} Searching...` });
    }

    try {
        // Resolve the input
        const { tracks, isPlaylist, name: playlistName } = await SearchService.resolve(query, user);

        if (!tracks || tracks.length === 0) {
            const embed = buildMusicErrorEmbed(`No results found for: \`${query}\``);
            if (isSlash) return context.editReply({ content: "", embeds: [embed] });
            return sentMsg.edit({ content: "", embeds: [embed] });
        }

        const queue = QueueService.getOrCreate(guild.id, { textChannel, voiceChannel });

        // Start playback
        const { started } = await MusicService.play({
            guildId:      guild.id,
            voiceChannel,
            textChannel,
            tracks,
            requester:    user,
            isPlaylist,
            playlistName,
        });

        // Build response embed
        // Skip the "Added to Queue" embed when the track started playing immediately
        // (empty queue) — a "Now Playing" embed covers that case instead, so we avoid
        // sending two embeds back to back.
        let embed = null;

        if (isPlaylist) {
            embed = buildPlaylistAddedEmbed(playlistName || "Playlist", tracks.length, tracks[0]?.source || "youtube", user);
        } else if (!started) {
            const updatedQueue = QueueService.get(guild.id);
            embed = buildTrackAddedEmbed(tracks[0], updatedQueue, user);
        }

        if (isSlash) {
            if (embed) {
                await context.editReply({ content: "", embeds: [embed] });
            } else {
                await context.deleteReply().catch(() => {});
            }
        } else {
            if (embed) {
                await sentMsg.edit({ content: "", embeds: [embed] });
            } else {
                await sentMsg.delete().catch(() => {});
            }
        }

    } catch (err) {
        console.error("[play] Error:", err.message);
        const embed = buildMusicErrorEmbed(err.message || "An error occurred while trying to play.");
        if (isSlash) {
            await context.editReply({ content: "", embeds: [embed] }).catch(() => {});
        } else {
            await sentMsg?.edit({ content: "", embeds: [embed] }).catch(() => {});
        }
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
    name: "play",
    aliases: ["p"],

    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a song or playlist from YouTube, Spotify, or SoundCloud")
        .addStringOption(opt =>
            opt.setName("query")
                .setDescription("Song name, URL, or playlist link")
                .setRequired(true)
        ),

    async executeSlash(interaction) {
        const query = interaction.options.getString("query");
        await executePlay(interaction, true, query);
    },

    async executePrefix(message, args) {
        const query = args.join(" ");
        await executePlay(message, false, query);
    },
};
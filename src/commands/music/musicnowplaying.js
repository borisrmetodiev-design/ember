// /musicnowplaying — show current track with progress bar and controls
// Distinct from Last.fm /np and /nowplaying
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const MusicService = require("../../services/music/MusicService");
const QueueService = require("../../services/music/QueueService");
const { buildNowPlayingEmbed, buildControlButtons, buildMusicErrorEmbed } = require("../../utils/music/embeds");

async function executeMusicNowPlaying(context, isSlash) {
    const guild  = context.guild;
    const member = context.member;

    if (!guild) {
        const e = buildMusicErrorEmbed("This command only works in servers.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    const queue = QueueService.get(guild.id);
    if (!queue?.current) {
        const e = buildMusicErrorEmbed("Nothing is currently playing.");
        return isSlash ? context.reply({ embeds: [e] }) : context.reply({ embeds: [e] });
    }

    const player  = MusicService.getPlayer(guild.id);
    const elapsed = (queue.seekOffset || 0) + (player?.elapsedSeconds || 0);

    const embed   = buildNowPlayingEmbed(queue.current, queue, elapsed);
    const buttons = buildControlButtons(queue);

    return isSlash
        ? context.reply({ embeds: [embed], components: buttons })
        : context.reply({ embeds: [embed], components: buttons });
}

module.exports = {
    name: "musicnowplaying",
    aliases: ["mnp", "musicnp", "mpnow"],
    data: new SlashCommandBuilder()
        .setName("musicnowplaying")
        .setDescription("Show the currently playing track with controls"),

    async executeSlash(interaction) { await executeMusicNowPlaying(interaction, true); },
    async executePrefix(message, args) { await executeMusicNowPlaying(message, false); },
};

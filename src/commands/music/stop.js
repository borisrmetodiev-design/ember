// /stop — stop playback, clear queue, disconnect
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const MusicService = require("../../services/music/MusicService");
const QueueService = require("../../services/music/QueueService");
const { buildMusicErrorEmbed, buildInfoEmbed } = require("../../utils/music/embeds");

async function executeStop(context, isSlash) {
    const guild  = context.guild;
    const member = context.member;

    if (!guild) {
        const e = buildMusicErrorEmbed("This command only works in servers.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }
    if (!member?.voice?.channel) {
        const e = buildMusicErrorEmbed("You must be in a voice channel.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    const queue = QueueService.get(guild.id);
    if (!queue?.current) {
        const e = buildMusicErrorEmbed("Nothing is currently playing.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    try {
        await MusicService.stop(guild.id);
        MusicService.cleanup(guild.id);
        const embed = buildInfoEmbed("⏹ Stopped", "Playback stopped and queue cleared.");
        return isSlash ? context.reply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
    } catch (err) {
        const e = buildMusicErrorEmbed(err.message);
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }
}

module.exports = {
    name: "stop",
    aliases: ["leave", "dc"],
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop playback, clear the queue, and disconnect"),

    async executeSlash(interaction) { await executeStop(interaction, true); },
    async executePrefix(message, args) { await executeStop(message, false); },
};

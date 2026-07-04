// /clear — clear all upcoming tracks from the queue
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const QueueService = require("../../services/music/QueueService");
const { buildMusicErrorEmbed, buildInfoEmbed } = require("../../utils/music/embeds");

async function executeClear(context, isSlash) {
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
    if (!queue || queue.tracks.length === 0) {
        const e = buildMusicErrorEmbed("The queue is already empty.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    const count = queue.tracks.length;
    QueueService.clear(guild.id);
    const embed = buildInfoEmbed("🗑️ Queue Cleared", `Removed **${count}** track${count !== 1 ? "s" : ""} from the queue.`);
    return isSlash ? context.reply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
}

module.exports = {
    name: "clear",
    aliases: ["clearqueue", "cq"],
    data: new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Clear all upcoming tracks from the queue"),

    async executeSlash(interaction) { await executeClear(interaction, true); },
    async executePrefix(message, args) { await executeClear(message, false); },
};

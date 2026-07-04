// /autoplay — toggle autoplay mode
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const QueueService = require("../../services/music/QueueService");
const { buildMusicErrorEmbed, buildInfoEmbed } = require("../../utils/music/embeds");

async function executeAutoplay(context, isSlash) {
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
    if (!queue) {
        const e = buildMusicErrorEmbed("No active queue. Start playing something first.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    const newState = !queue.autoplay;
    QueueService.setAutoplay(guild.id, newState);

    const embed = buildInfoEmbed(
        "🔄 Autoplay",
        `Autoplay is now **${newState ? "enabled" : "disabled"}**.\n${newState ? "Related tracks will be added when the queue is empty." : "No tracks will be added automatically."}`
    );
    return isSlash ? context.reply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
}

module.exports = {
    name: "autoplay",
    aliases: ["ap"],
    data: new SlashCommandBuilder()
        .setName("autoplay")
        .setDescription("Toggle autoplay — automatically queue related tracks when the queue is empty"),

    async executeSlash(interaction) { await executeAutoplay(interaction, true); },
    async executePrefix(message, args) { await executeAutoplay(message, false); },
};

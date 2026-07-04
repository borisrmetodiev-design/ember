// /previous — go back to the previous track
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const MusicService = require("../../services/music/MusicService");
const QueueService = require("../../services/music/QueueService");
const { buildMusicErrorEmbed, buildInfoEmbed } = require("../../utils/music/embeds");

async function executePrevious(context, isSlash) {
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
        const e = buildMusicErrorEmbed("Nothing is currently playing.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }
    if (!queue.history || queue.history.length === 0) {
        const e = buildMusicErrorEmbed("No previous track in history.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    try {
        await MusicService.previous(guild.id);
        const embed = buildInfoEmbed("⏮ Previous", "Going back to the previous track...");
        return isSlash ? context.reply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
    } catch (err) {
        const e = buildMusicErrorEmbed(err.message);
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }
}

module.exports = {
    name: "previous",
    aliases: ["prev", "back"],
    data: new SlashCommandBuilder()
        .setName("previous")
        .setDescription("Go back to the previous track"),

    async executeSlash(interaction) { await executePrevious(interaction, true); },
    async executePrefix(message, args) { await executePrevious(message, false); },
};

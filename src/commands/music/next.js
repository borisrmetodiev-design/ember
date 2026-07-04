// /next — alias for skip
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const MusicService = require("../../services/music/MusicService");
const QueueService = require("../../services/music/QueueService");
const { buildMusicErrorEmbed, buildInfoEmbed } = require("../../utils/music/embeds");

async function executeNext(context, isSlash) {
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
        const skipped = queue.current.title;
        await MusicService.skip(guild.id);
        const embed = buildInfoEmbed("⏭ Next", `Skipped **${skipped}**.`);
        return isSlash ? context.reply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
    } catch (err) {
        const e = buildMusicErrorEmbed(err.message);
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }
}

module.exports = {
    name: "next",
    aliases: ["n"],
    data: new SlashCommandBuilder()
        .setName("next")
        .setDescription("Skip to the next track (alias for /skip)"),

    async executeSlash(interaction) { await executeNext(interaction, true); },
    async executePrefix(message, args) { await executeNext(message, false); },
};

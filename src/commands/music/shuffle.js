// /shuffle — shuffle the upcoming queue
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const QueueService = require("../../services/music/QueueService");
const { buildMusicErrorEmbed, buildInfoEmbed } = require("../../utils/music/embeds");

async function executeShuffle(context, isSlash) {
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
    if (!queue?.tracks || queue.tracks.length === 0) {
        const e = buildMusicErrorEmbed("The queue is empty — nothing to shuffle.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    QueueService.shuffle(guild.id);
    const embed = buildInfoEmbed("🔀 Shuffled", `Shuffled **${queue.tracks.length}** tracks in the queue.`);
    return isSlash ? context.reply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
}

module.exports = {
    name: "shuffle",
    aliases: ["sh"],
    data: new SlashCommandBuilder()
        .setName("shuffle")
        .setDescription("Shuffle the upcoming queue"),

    async executeSlash(interaction) { await executeShuffle(interaction, true); },
    async executePrefix(message, args) { await executeShuffle(message, false); },
};

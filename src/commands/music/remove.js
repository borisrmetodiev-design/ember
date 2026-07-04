// /remove — remove a track at a specific position from the queue
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const QueueService = require("../../services/music/QueueService");
const { buildMusicErrorEmbed, buildInfoEmbed } = require("../../utils/music/embeds");
const { truncate } = require("../../utils/music/formatters");

async function executeRemove(context, isSlash, position) {
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
        const e = buildMusicErrorEmbed("The queue is empty.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    if (!position || isNaN(position) || position < 1) {
        const e = buildMusicErrorEmbed("Please provide a valid position number (1 or higher).");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    if (position > queue.tracks.length) {
        const e = buildMusicErrorEmbed(`Position ${position} is out of range. The queue has ${queue.tracks.length} track(s).`);
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    const removed = QueueService.remove(guild.id, position);
    if (!removed) {
        const e = buildMusicErrorEmbed("Failed to remove the track. Please try again.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    const embed = buildInfoEmbed("🗑️ Removed", `Removed **${truncate(removed.title, 60)}** from position \`${position}\`.`);
    return isSlash ? context.reply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
}

module.exports = {
    name: "remove",
    aliases: ["rm", "del"],
    data: new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove a track from the queue by its position")
        .addIntegerOption(opt =>
            opt.setName("position")
                .setDescription("Position in the queue (1 = next track)")
                .setRequired(true)
                .setMinValue(1)
        ),

    async executeSlash(interaction) {
        const position = interaction.options.getInteger("position");
        await executeRemove(interaction, true, position);
    },

    async executePrefix(message, args) {
        const position = parseInt(args[0]);
        await executeRemove(message, false, position);
    },
};

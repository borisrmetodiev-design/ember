// /jump — skip to a specific position in the queue
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const MusicService = require("../../services/music/MusicService");
const QueueService = require("../../services/music/QueueService");
const { buildMusicErrorEmbed, buildInfoEmbed } = require("../../utils/music/embeds");
const { truncate } = require("../../utils/music/formatters");

async function executeJump(context, isSlash, position) {
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
    if (!queue?.current && (!queue?.tracks || queue.tracks.length === 0)) {
        const e = buildMusicErrorEmbed("The queue is empty.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    const pos = parseInt(position);
    if (isNaN(pos) || pos < 1) {
        const e = buildMusicErrorEmbed("Please provide a valid queue position (starting at 1).");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    if (pos > queue.tracks.length) {
        const e = buildMusicErrorEmbed(`Invalid position. The queue only has **${queue.tracks.length}** upcoming track${queue.tracks.length !== 1 ? "s" : ""}.`);
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    if (isSlash && !context.deferred && !context.replied) {
        await context.deferReply().catch(() => {});
    }

    try {
        const track = await MusicService.jumpTo(guild.id, pos);
        const embed = buildInfoEmbed("⏩ Jumped", `Now playing **${truncate(track.title, 80)}**.`);
        return isSlash ? context.editReply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
    } catch (err) {
        const e = buildMusicErrorEmbed(err.message || "Failed to jump to that track.");
        return isSlash ? context.editReply({ embeds: [e] }) : context.reply({ embeds: [e] });
    }
}

module.exports = {
    name: "jump",
    aliases: ["j"],
    data: new SlashCommandBuilder()
        .setName("jump")
        .setDescription("Jump to a specific position in the queue")
        .addIntegerOption(opt =>
            opt.setName("position")
                .setDescription("Queue position to jump to (1 = next up)")
                .setRequired(true)
                .setMinValue(1)
        ),

    async executeSlash(interaction) {
        const position = interaction.options.getInteger("position");
        await executeJump(interaction, true, position);
    },

    async executePrefix(message, args) {
        await executeJump(message, false, args[0]);
    },
};

// /seek — seek to a position in the current track
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const MusicService = require("../../services/music/MusicService");
const QueueService = require("../../services/music/QueueService");
const { buildMusicErrorEmbed, buildInfoEmbed } = require("../../utils/music/embeds");
const { parseTimeInput, formatSeconds } = require("../../utils/music/formatters");

async function executeSeek(context, isSlash, timeInput) {
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

    const seconds = parseTimeInput(timeInput);
    if (seconds < 0) {
        const e = buildMusicErrorEmbed("Invalid time format. Use `1:30`, `90`, or `1:30:00`.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    const totalSecs = queue.current.duration ? Math.floor(queue.current.duration / 1000) : 0;
    if (totalSecs > 0 && seconds >= totalSecs) {
        const e = buildMusicErrorEmbed(`Cannot seek past the end of the track (${formatSeconds(totalSecs)}).`);
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    // Defer for slash (seek can take a moment)
    if (isSlash && !context.deferred && !context.replied) {
        await context.deferReply().catch(() => {});
    }

    try {
        await MusicService.seek(guild.id, seconds);
        const embed = buildInfoEmbed("⏩ Seeked", `Jumped to \`${formatSeconds(seconds)}\` in **${queue.current.title}**.`);
        return isSlash ? context.editReply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
    } catch (err) {
        const e = buildMusicErrorEmbed(err.message || "Failed to seek.");
        return isSlash ? context.editReply({ embeds: [e] }) : context.reply({ embeds: [e] });
    }
}

module.exports = {
    name: "seek",
    data: new SlashCommandBuilder()
        .setName("seek")
        .setDescription("Seek to a position in the current track")
        .addStringOption(opt =>
            opt.setName("time")
                .setDescription("Position to seek to (e.g. 1:30, 90, 2:00:00)")
                .setRequired(true)
        ),

    async executeSlash(interaction) {
        const time = interaction.options.getString("time");
        await executeSeek(interaction, true, time);
    },

    async executePrefix(message, args) {
        const time = args[0];
        await executeSeek(message, false, time);
    },
};

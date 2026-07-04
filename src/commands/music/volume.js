// /volume — set or show the playback volume
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const MusicService = require("../../services/music/MusicService");
const QueueService = require("../../services/music/QueueService");
const { buildMusicErrorEmbed, buildInfoEmbed } = require("../../utils/music/embeds");
const { buildVolumeBar } = require("../../utils/music/progressBar");

async function executeVolume(context, isSlash, amount) {
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

    // If no amount given, show current volume
    if (amount === null || amount === undefined) {
        const bar = buildVolumeBar(queue.volume);
        const embed = buildInfoEmbed("🔊 Volume", `Current volume: ${bar} \`${queue.volume}%\``);
        return isSlash ? context.reply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
    }

    const vol = parseInt(amount);
    if (isNaN(vol) || vol < 0 || vol > 100) {
        const e = buildMusicErrorEmbed("Volume must be a number between `0` and `100`.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    MusicService.setVolume(guild.id, vol);
    const bar = buildVolumeBar(vol);
    const embed = buildInfoEmbed("🔊 Volume", `Volume set to: ${bar} \`${vol}%\``);
    return isSlash ? context.reply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
}

module.exports = {
    name: "volume",
    aliases: ["vol", "v"],
    data: new SlashCommandBuilder()
        .setName("volume")
        .setDescription("Set or view the playback volume")
        .addIntegerOption(opt =>
            opt.setName("amount")
                .setDescription("Volume level (0-100). Omit to see current volume.")
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(100)
        ),

    async executeSlash(interaction) {
        const amount = interaction.options.getInteger("amount");
        await executeVolume(interaction, true, amount);
    },

    async executePrefix(message, args) {
        const amount = args[0] !== undefined ? args[0] : null;
        await executeVolume(message, false, amount);
    },
};

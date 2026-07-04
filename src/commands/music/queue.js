// /queue — show paginated queue
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const QueueService = require("../../services/music/QueueService");
const { buildQueueEmbed, buildMusicErrorEmbed } = require("../../utils/music/embeds");

async function executeQueue(context, isSlash, page = 1) {
    const guild = context.guild;

    if (!guild) {
        const e = buildMusicErrorEmbed("This command only works in servers.");
        return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
    }

    const queue = QueueService.get(guild.id);
    if (!queue?.current && (!queue?.tracks || queue.tracks.length === 0)) {
        const e = buildMusicErrorEmbed("The queue is empty. Use `/play` to add songs!");
        return isSlash ? context.reply({ embeds: [e] }) : context.reply({ embeds: [e] });
    }

    const embed = buildQueueEmbed(queue, page);
    return isSlash ? context.reply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
}

module.exports = {
    name: "queue",
    aliases: ["q"],
    data: new SlashCommandBuilder()
        .setName("queue")
        .setDescription("Show the current music queue")
        .addIntegerOption(opt =>
            opt.setName("page")
                .setDescription("Page number")
                .setRequired(false)
                .setMinValue(1)
        ),

    async executeSlash(interaction) {
        const page = interaction.options.getInteger("page") || 1;
        await executeQueue(interaction, true, page);
    },

    async executePrefix(message, args) {
        const page = parseInt(args[0]) || 1;
        await executeQueue(message, false, page);
    },
};

// /loop — set loop mode (none, song, queue)
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const QueueService = require("../../services/music/QueueService");
const { buildMusicErrorEmbed, buildInfoEmbed } = require("../../utils/music/embeds");
const { LOOP_MODES, LOOP_LABELS } = require("../../utils/music/constants");

const MODE_MAP = {
    "none":  LOOP_MODES.NONE,
    "off":   LOOP_MODES.NONE,
    "song":  LOOP_MODES.SONG,
    "track": LOOP_MODES.SONG,
    "queue": LOOP_MODES.QUEUE,
    "all":   LOOP_MODES.QUEUE,
};

async function executeLoop(context, isSlash, modeInput) {
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

    let mode;
    if (!modeInput) {
        // Cycle through modes if no argument
        const current = queue.loop;
        mode = current === LOOP_MODES.NONE ? LOOP_MODES.SONG
             : current === LOOP_MODES.SONG  ? LOOP_MODES.QUEUE
             : LOOP_MODES.NONE;
    } else {
        mode = MODE_MAP[modeInput.toLowerCase()];
        if (!mode && mode !== LOOP_MODES.NONE) {
            const e = buildMusicErrorEmbed("Invalid loop mode. Use `none`, `song`, or `queue`.");
            return isSlash ? context.reply({ embeds: [e], flags: MessageFlags.Ephemeral }) : context.reply({ embeds: [e] });
        }
    }

    QueueService.setLoop(guild.id, mode);
    const label = LOOP_LABELS[mode] || "Off";
    const embed = buildInfoEmbed("🔁 Loop", `Loop mode set to: **${label}**`);
    return isSlash ? context.reply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
}

module.exports = {
    name: "loop",
    aliases: ["l", "repeat"],
    data: new SlashCommandBuilder()
        .setName("loop")
        .setDescription("Set the loop mode")
        .addStringOption(opt =>
            opt.setName("mode")
                .setDescription("Loop mode: none, song, or queue")
                .setRequired(false)
                .addChoices(
                    { name: "Off",   value: "none"  },
                    { name: "Song",  value: "song"  },
                    { name: "Queue", value: "queue" },
                )
        ),

    async executeSlash(interaction) {
        const mode = interaction.options.getString("mode");
        await executeLoop(interaction, true, mode);
    },

    async executePrefix(message, args) {
        const mode = args[0]?.toLowerCase();
        await executeLoop(message, false, mode);
    },
};

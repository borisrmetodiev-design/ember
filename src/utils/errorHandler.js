const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const ERROR_EMOJI = "<:emberERROR:1453031359894261790>";
const BORIS_ID_1 = process.env.BORIS_ID_1;
const BORIS_ID_2 = process.env.BORIS_ID_2;

const ERROR_MAP = {
    "001": "The bot needs to be in that server to fetch its assets.",
    "002": "That doesn’t look like a valid ID.",
    "003": "No asset found (avatar/banner/icon)."
};

function buildErrorEmbed(code, err) {
    const embed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle(`${ERROR_EMOJI} Error ${code}`)
        .setDescription(ERROR_MAP[code] || "Unknown error.")
        .setFooter({ text: "Ember Utility — Error" })
        .setTimestamp();

    let components = [];
    if (err) {
        const customId = `error_details_${Date.now()}`;
        global.errorCache = global.errorCache || {};
        global.errorCache[customId] = err;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(customId)
                .setLabel("Show Details")
                .setStyle(ButtonStyle.Danger)
        );
        components = [row];
    }

    return { embed, components };
}

async function handleErrorButton(interaction) {
    const errorObj = global.errorCache?.[interaction.customId];

    if (![BORIS_ID_1, BORIS_ID_2].includes(interaction.user.id)) {
        return interaction.reply({
            content: "You don’t have permission to view error details.",
            ephemeral: true
        });
    }

    await interaction.reply({
        content: `\`\`\`js\n${errorObj?.stack || errorObj?.message || "No details"}\n\`\`\``,
        ephemeral: true
    });
}

module.exports = { buildErrorEmbed, handleErrorButton };
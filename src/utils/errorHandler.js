const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const path = require("path");
const fs = require("fs");

const ERROR_EMOJI = "<:emberERROR:1453031359894261790>";
const BORIS_ID_1 = process.env.BORIS_ID_1;
const BORIS_ID_2 = process.env.BORIS_ID_2;

// Dynamically load ERROR_MAP from errors.json
let ERROR_MAP = {};
try {
    const errorsPath = path.join(__dirname, "errors.json");
    ERROR_MAP = JSON.parse(fs.readFileSync(errorsPath, "utf8"));
} catch (err) {
    console.error("Failed to load errors.json:", err);
    ERROR_MAP = { "000": "Error loading error messages." };
}

function buildErrorEmbed(code, err) {
    const embed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle(`${ERROR_EMOJI} Error ${code}`)
        .setDescription(ERROR_MAP[code] || "Unknown error.")
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
    // Check if interaction is already handled
    if (interaction.replied || interaction.deferred) {
        return;
    }

    const errorObj = global.errorCache?.[interaction.customId];

    // Check permissions first
    if (![BORIS_ID_1, BORIS_ID_2].includes(interaction.user.id)) {
        try {
            await interaction.reply({
                content: "You don't have permission to view error details.",
                flags: MessageFlags.Ephemeral
            });
        } catch (err) {
            console.error("Failed to send permission error:", err.message);
        }
        return;
    }

    // Format the error stack/message for console-like output
    const errorDetails = errorObj?.stack || errorObj?.message || "No details available";
    
    try {
        await interaction.reply({
            content: `\`\`\`js\n${errorDetails}\n\`\`\``,
            flags: MessageFlags.Ephemeral
        });
    } catch (err) {
        console.error("Failed to reply to error button interaction:", err.message);
        // Interaction token likely expired, nothing we can do
    }
}

module.exports = { buildErrorEmbed, handleErrorButton };
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const path = require("path");
const { readJSON, writeJSON } = require("../../utils/database");

const dataPath = path.join(__dirname, "../../storage/data/npCustomization.json");

async function loadDB() {
    try {
        const data = await readJSON(dataPath);
        return data.users ? data : { users: {} };
    } catch (err) {
        console.error("Failed to load npCustomization.json:", err);
        return { users: {} };
    }
}

async function saveDB(db) {
    try {
        await writeJSON(dataPath, db);
    } catch (err) {
        console.error("Failed to save npCustomization.json:", err);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("lastfmreactions")
        .setDescription("Customize the reactions for your Now Playing messages")
        .addStringOption(option =>
            option.setName("upvote_emoji")
                .setDescription("The emoji to use for upvoting (e.g., 🔥)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("downvote_emoji")
                .setDescription("The emoji to use for downvoting (e.g., 💩)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("scope")
                .setDescription("Should this apply globally or only to this server?")
                .setRequired(true)
                .addChoices(
                    { name: "Global", value: "global" },
                    { name: "Server Specific", value: "server" }
                )
        ),

    async executeSlash(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const up = interaction.options.getString("upvote_emoji");
            const down = interaction.options.getString("downvote_emoji");
            const scope = interaction.options.getString("scope");
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            const db = await loadDB();
            if (!db.users[userId]) {
                db.users[userId] = { global: null, guilds: {} };
            }

            if (scope === "global") {
                db.users[userId].global = { up, down };
            } else {
                if (!guildId) {
                    return interaction.editReply({ content: "Server specific scope can only be set inside a server!" });
                }
                db.users[userId].guilds[guildId] = { up, down };
            }

            await saveDB(db);

            const embed = new EmbedBuilder()
                .setColor("#00ff00")
                .setTitle("Now Playing Customization Updated")
                .setDescription(`Your reactions have been set to ${up} and ${down} (${scope}).`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error("Error in lastfmreactions:", err);
            // Try to notify user if possible
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: "An error occurred while updating your preferences." });
            } else {
                await interaction.reply({ content: "An error occurred.", ephemeral: true });
            }
        }
    }
};

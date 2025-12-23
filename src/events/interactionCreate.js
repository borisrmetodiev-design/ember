const { buildErrorEmbed, handleErrorButton } = require("../utils/errorHandler");

module.exports = (client) => {
    client.on("interactionCreate", async (interaction) => {
        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command) return;

                try {
                    await command.executeSlash(interaction);
                } catch (err) {
                    const { embed, components } = buildErrorEmbed(err.code || "004", err.err || err);
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ embeds: [embed], components, ephemeral: true });
                    } else {
                        await interaction.reply({ embeds: [embed], components, ephemeral: true });
                    }
                }
            }

            // Handle error detail buttons
            if (interaction.isButton() && interaction.customId.startsWith("error_details_")) {
                await handleErrorButton(interaction);
            }
        } catch (err) {
            console.error("Unhandled interaction error:", err);
        }
    });
};
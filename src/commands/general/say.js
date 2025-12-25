const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    // Slash command
    data: new SlashCommandBuilder()
        .setName("say")
        .setDescription("Make the bot repeat your message")
        .addStringOption(option =>
            option
                .setName("text")
                .setDescription("The text to repeat")
                .setRequired(true)
        ),

    // Prefix command
    name: "say",
    aliases: ["repeat", "echo"],

    async executeSlash(interaction) {
        try {
            const text = interaction.options.getString("text");
            if (!text) throw { code: "004" }; // Missing required arguments

            await interaction.reply(text);
        } catch (err) {
            if (err.code === "004") {
                const embed = new EmbedBuilder()
                    .setColor("#ff3300")
                    .setTitle("Error 004")
                    .setDescription("Missing required arguments.\nYou must provide text for the bot to repeat.")
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            throw err;
        }
    },

    async executePrefix(message, args) {
        try {
            const text = args.join(" ");
            if (!text) throw { code: "004" }; // Missing required arguments

            // Delete the original command message
            await message.delete().catch(() => {});

            // Send the repeated text
            await message.channel.send(text);
        } catch (err) {
            if (err.code === "004") {
                const embed = new EmbedBuilder()
                    .setColor("#ff3300")
                    .setTitle("Error 004")
                    .setDescription("Missing required arguments.\nYou must provide text for the bot to repeat.")
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }
            throw err;
        }
    }
};
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("serverpfp")
        .setDescription("Get the server's profile picture (icon)")
        .addBooleanOption(option =>
            option.setName("ephemeral").setDescription("Send the server icon as ephemeral").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("spoiler").setDescription("Send the server icon as a spoiler").setRequired(false)
        ),

    name: "serverpfp",
    aliases: ["serveravatar"],

    async executeSlash(interaction) {
        const ephemeral = interaction.options.getBoolean("ephemeral") || false;
        const spoiler = interaction.options.getBoolean("spoiler") || false;

        try {
            const iconUrl = interaction.guild.iconURL({ size: 4096, dynamic: true });
            if (!iconUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({ name: `${interaction.guild.name}'s Icon` })
                .setImage(spoiler ? `||${iconUrl}||` : iconUrl)
                .setFooter({ text: `Guild ID: ${interaction.guild.id} • Ember Utility — Server Icon` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral });
        } catch (err) {
            // Pass error to global error handler
            throw err.code ? err : { code: "004", err };
        }
    },

    async executePrefix(message, args) {
        const spoiler = args.includes("--spoiler");
        let guild;

        try {
            if (args[0] && /^\d+$/.test(args[0])) {
                guild = await message.client.guilds.fetch(args[0]).catch(() => { throw { code: "001" }; });
            } else {
                guild = message.guild;
            }

            if (!guild) throw { code: "002" };

            const iconUrl = guild.iconURL({ size: 4096, dynamic: true });
            if (!iconUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({ name: `${guild.name}'s Icon` })
                .setImage(spoiler ? `||${iconUrl}||` : iconUrl)
                .setFooter({ text: `Guild ID: ${guild.id} • Ember Utility — Server Icon` })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (err) {
            // Pass error to global error handler
            throw err.code ? err : { code: "004", err };
        }
    }
};
module.exports = {
    data: new SlashCommandBuilder()
        .setName("serveravatar")
        .setDescription("Get the server's profile picture (icon)")
        .addBooleanOption(option =>
            option.setName("ephemeral").setDescription("Send the server icon as ephemeral").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("spoiler").setDescription("Send the server icon as a spoiler").setRequired(false)
        ),

    name: "serveravatar",
    aliases: ["serverpfp"],

    async executeSlash(interaction) {
        const ephemeral = interaction.options.getBoolean("ephemeral") || false;
        const spoiler = interaction.options.getBoolean("spoiler") || false;

        try {
            const iconUrl = interaction.guild.iconURL({ size: 4096, dynamic: true });
            if (!iconUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({ name: `${interaction.guild.name}'s Icon` })
                .setImage(spoiler ? `||${iconUrl}||` : iconUrl)
                .setFooter({ text: `Guild ID: ${interaction.guild.id} • Ember Utility — Server Icon` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral });
        } catch (err) {
            // Pass error to global error handler
            throw err.code ? err : { code: "004", err };
        }
    },

    async executePrefix(message, args) {
        const spoiler = args.includes("--spoiler");
        let guild;

        try {
            if (args[0] && /^\d+$/.test(args[0])) {
                guild = await message.client.guilds.fetch(args[0]).catch(() => { throw { code: "001" }; });
            } else {
                guild = message.guild;
            }

            if (!guild) throw { code: "002" };

            const iconUrl = guild.iconURL({ size: 4096, dynamic: true });
            if (!iconUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({ name: `${guild.name}'s Icon` })
                .setImage(spoiler ? `||${iconUrl}||` : iconUrl)
                .setFooter({ text: `Guild ID: ${guild.id} • Ember Utility — Server Icon` })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (err) {
            // Pass error to global error handler
            throw err.code ? err : { code: "004", err };
        }
    }
};
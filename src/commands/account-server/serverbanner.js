const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("serverbanner")
        .setDescription("Get the server's banner")
        .addBooleanOption(option =>
            option.setName("ephemeral").setDescription("Send the server banner as ephemeral").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("spoiler").setDescription("Send the server banner as a spoiler").setRequired(false)
        ),

    name: "serverbanner",

    async executeSlash(interaction) {
        const ephemeral = interaction.options.getBoolean("ephemeral") || false;
        const spoiler = interaction.options.getBoolean("spoiler") || false;

        try {
            const bannerUrl = interaction.guild.bannerURL({ size: 4096, dynamic: true });
            if (!bannerUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({ name: `${interaction.guild.name}'s Banner` })
                .setImage(spoiler ? `||${bannerUrl}||` : bannerUrl)
                .setFooter({ text: `Guild ID: ${interaction.guild.id} • Ember Utility — Server Banner` })
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

            const bannerUrl = guild.bannerURL({ size: 4096, dynamic: true });
            if (!bannerUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({ name: `${guild.name}'s Banner` })
                .setImage(spoiler ? `||${bannerUrl}||` : bannerUrl)
                .setFooter({ text: `Guild ID: ${guild.id} • Ember Utility — Server Banner` })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (err) {
            // Pass error to global error handler
            throw err.code ? err : { code: "004", err };
        }
    }
};
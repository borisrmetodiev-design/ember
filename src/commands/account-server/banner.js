const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("banner")
        .setDescription("Get the banner of a user")
        .addUserOption(option =>
            option.setName("user").setDescription("The user to get the banner of").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("ephemeral").setDescription("Send the banner as ephemeral").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("spoiler").setDescription("Send the banner as a spoiler").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("server").setDescription("Show the server banner if available").setRequired(false)
        ),

    name: "banner",

    async executeSlash(interaction) {
        const targetUser = interaction.options.getUser("user") || interaction.user;
        const ephemeral = interaction.options.getBoolean("ephemeral") || false;
        const spoiler = interaction.options.getBoolean("spoiler") || false;
        const server = interaction.options.getBoolean("server") || false;

        try {
            let bannerUrl;
            if (server && interaction.guild) {
                const member = await interaction.guild.members.fetch(targetUser.id);
                bannerUrl = member.bannerURL({ size: 4096, dynamic: true });
            } else {
                const user = await interaction.client.users.fetch(targetUser.id, { force: true });
                bannerUrl = user.bannerURL({ size: 4096, dynamic: true });
            }

            if (!bannerUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({ name: `${targetUser.username}'s Banner`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setImage(spoiler ? `||${bannerUrl}||` : bannerUrl)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral });
        } catch (err) {
            throw err.code ? err : { code: "004", err };
        }
    },

    async executePrefix(message, args) {
        try {
            let targetUser;
            if (message.mentions.users.size > 0) {
                targetUser = message.mentions.users.first();
            } else if (args[0] && /^\d+$/.test(args[0])) {
                try {
                    targetUser = await message.client.users.fetch(args[0]);
                } catch {
                    throw { code: "002" };
                }
            } else {
                targetUser = message.author;
            }

            const spoiler = args.includes("--spoiler");
            const server = args.includes("--server");

            let bannerUrl;
            if (server && message.guild) {
                const member = await message.guild.members.fetch(targetUser.id);
                bannerUrl = member.bannerURL({ size: 4096, dynamic: true });
            } else {
                const user = await message.client.users.fetch(targetUser.id, { force: true });
                bannerUrl = user.bannerURL({ size: 4096, dynamic: true });
            }

            if (!bannerUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({ name: `${targetUser.username}'s Banner`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setImage(spoiler ? `||${bannerUrl}||` : bannerUrl)
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (err) {
            throw err.code ? err : { code: "004", err };
        }
    }
};
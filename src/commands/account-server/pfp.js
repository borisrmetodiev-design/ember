const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pfp")
        .setDescription("Get the profile picture of a user")
        .addUserOption(option =>
            option.setName("user").setDescription("The user to get the profile picture of").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("ephemeral").setDescription("Send the avatar as ephemeral").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("spoiler").setDescription("Send the avatar as a spoiler").setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("server").setDescription("Show the server avatar if available").setRequired(false)
        ),

    name: "pfp",
    aliases: ["avatar", "profilepic"],

    async executeSlash(interaction) {
        try {
            const targetUser = interaction.options.getUser("user") || interaction.user;
            const ephemeral = interaction.options.getBoolean("ephemeral") || false;
            const spoiler = interaction.options.getBoolean("spoiler") || false;
            const server = interaction.options.getBoolean("server") || false;

            let avatarUrl;
            if (server && interaction.guild) {
                const member = await interaction.guild.members.fetch(targetUser.id);
                avatarUrl = member.displayAvatarURL({ size: 4096, dynamic: true });
            } else {
                avatarUrl = targetUser.displayAvatarURL({ size: 4096, dynamic: true });
            }

            if (!avatarUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({ name: `${targetUser.username}'s Avatar`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setImage(spoiler ? `||${avatarUrl}||` : avatarUrl)
                .setFooter({ text: "Ember Utility — Profile Picture" })
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

            let avatarUrl;
            if (server && message.guild) {
                const member = await message.guild.members.fetch(targetUser.id);
                avatarUrl = member.displayAvatarURL({ size: 4096, dynamic: true });
            } else {
                avatarUrl = targetUser.displayAvatarURL({ size: 4096, dynamic: true });
            }

            if (!avatarUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({ name: `${targetUser.username}'s Avatar`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setImage(spoiler ? `||${avatarUrl}||` : avatarUrl)
                .setFooter({ text: "Ember Utility — Profile Picture" })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        } catch (err) {
            throw err.code ? err : { code: "004", err };
        }
    }
};
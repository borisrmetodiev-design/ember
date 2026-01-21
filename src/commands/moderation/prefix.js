const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const prefixService = require("../../services/prefixService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("prefix")
        .setDescription("Change the bot's prefix for this server")
        .addStringOption(option =>
            option
                .setName("new_prefix")
                .setDescription("The new prefix for this server")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    name: "prefix",
    aliases: ["setprefix"],

    async executeSlash(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        }

        const newPrefix = interaction.options.getString("new_prefix");
        
        if (newPrefix.length > 5) {
            return interaction.reply({ content: "The prefix cannot be longer than 5 characters.", ephemeral: true });
        }

        prefixService.setPrefix(interaction.guild.id, newPrefix);

        const embed = new EmbedBuilder()
            .setTitle("Prefix Changed")
            .setDescription(`The prefix for this server has been changed to \`${newPrefix}\`.\nNote: \`\\\` and \`\\\\\` will still work as global prefixes.`)
            .setColor("#00FF00")
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message, args) {
        if (!message.guild) {
            return message.reply("This command can only be used in a server.");
        }

        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("You need Administrator permissions to use this command.");
        }

        const newPrefix = args[0];
        if (!newPrefix) {
            const currentPrefix = prefixService.getPrefix(message.guild.id, "\\");
            return message.reply(`The current prefix for this server is \`${currentPrefix}\`. Use \`prefix [new_prefix]\` to change it.`);
        }

        if (newPrefix.length > 5) {
            return message.reply("The prefix cannot be longer than 5 characters.");
        }

        prefixService.setPrefix(message.guild.id, newPrefix);

        const embed = new EmbedBuilder()
            .setTitle("Prefix Changed")
            .setDescription(`The prefix for this server has been changed to \`${newPrefix}\`.\nNote: \`\\\` and \`\\\\\` will still work as global prefixes.`)
            .setColor("#00FF00")
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Shows the list of available commands")
        .addStringOption(option =>
            option
                .setName("command")
                .setDescription("Get specific info on a command")
                .setRequired(false)
        ),

    name: "help",
    aliases: ["h", "commands"],

    async executeSlash(interaction) {
        const commandName = interaction.options.getString("command");
        const helpData = JSON.parse(fs.readFileSync(path.join(__dirname, "../../storage/utils/help.json"), "utf8"));
        
        if (commandName) {
            return this.sendCommandHelp(interaction, commandName, helpData, true);
        }

        const embed = this.buildHelpEmbed(helpData, interaction.client.user.displayAvatarURL());
        await interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message, args) {
        const commandName = args[0];
        const helpData = JSON.parse(fs.readFileSync(path.join(__dirname, "../../storage/utils/help.json"), "utf8"));

        if (commandName) {
            return this.sendCommandHelp(message, commandName, helpData, false);
        }

        const embed = this.buildHelpEmbed(helpData, message.client.user.displayAvatarURL());
        await message.reply({ embeds: [embed] });
    },

    buildHelpEmbed(helpData, iconUrl) {
        const embed = new EmbedBuilder()
            .setTitle("Bot Commands")
            .setColor("#5865F2")
            .setThumbnail(iconUrl)
            .setDescription("Use `\\help [command]` for more info on a specific command.")
            .setTimestamp();

        for (const category of helpData.categories) {
            const commandList = category.commands.map(cmd => `\`${cmd.name}\``).join(", ");
            embed.addFields({
                name: category.name,
                value: commandList || "No commands available.",
                inline: false
            });
        }

        return embed;
    },

    async sendCommandHelp(context, commandName, helpData, isSlash) {
        let foundCommand = null;
        const searchName = commandName.toLowerCase();

        for (const cat of helpData.categories) {
            foundCommand = cat.commands.find(c => 
                c.name.toLowerCase() === searchName || 
                (c.aliases && c.aliases.some(a => a.toLowerCase() === searchName))
            );
            if (foundCommand) break;
        }

        if (!foundCommand) {
            const content = `Command \`${commandName}\` not found. Use \`\\help\` to see all commands.`;
            return isSlash ? context.reply({ content, ephemeral: true }) : context.reply(content);
        }

        const embed = new EmbedBuilder()
            .setTitle(`Command: ${foundCommand.name}`)
            .setColor("#5865F2")
            .addFields(
                { name: "Description", value: foundCommand.description || "No description provided." },
                { name: "Usage", value: `\`${foundCommand.usage || "No usage provided."}\`` }
            )
            .setTimestamp();

        if (foundCommand.slashUsage) {
            embed.addFields({ name: "Slash Usage", value: `\`${foundCommand.slashUsage}\`` });
        }

        if (foundCommand.aliases && foundCommand.aliases.length > 0) {
            embed.addFields({ name: "Aliases", value: foundCommand.aliases.map(a => `\`${a}\``).join(", ") });
        }

        return isSlash ? context.reply({ embeds: [embed] }) : context.reply({ embeds: [embed] });
    }
};

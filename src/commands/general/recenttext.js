const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const prefixService = require("../../services/prefixService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("recenttext")
        .setDescription("Sends the most recent text message posted in this channel"),

    name: "recenttext",
    aliases: ["rt", "lasttext"],

    async executeSlash(interaction) {
        try {
            const messages = await interaction.channel.messages.fetch({ limit: 50 });
            
            // Get the prefix for this guild to filter out commands
            const guildId = interaction.guild?.id;
            const defaultPrefix = process.env.HOST_ENV === "server" ? "\\" : "\\\\";
            const serverPrefix = guildId ? prefixService.getPrefix(guildId, defaultPrefix) : defaultPrefix;

            const recentTextMessage = messages.find(m => {
                if (m.id === interaction.id || m.author.bot) return false;
                if (!m.content || m.content.trim() === "") return false;
                
                // Exclude commands
                if (m.content.startsWith(serverPrefix) || m.content.startsWith("\\") || m.content.startsWith("\\\\")) return false;
                
                return true;
            });

            if (!recentTextMessage) {
                throw { code: "024" };
            }

            const embed = new EmbedBuilder()
                .setTitle("Recent Text")
                .setDescription(`${recentTextMessage.content}\n\n[Jump to Message](${recentTextMessage.url})`)
                .setColor("#ff6600")
                .setTimestamp(recentTextMessage.createdTimestamp)
                .setFooter({ 
                    text: `Posted by ${recentTextMessage.author.username}`, 
                    iconURL: recentTextMessage.author.displayAvatarURL({ dynamic: true }) 
                });

            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            throw err.code ? err : { code: "014", err };
        }
    },

    async executePrefix(message, args, client) {
        try {
            const messages = await message.channel.messages.fetch({ limit: 50 });
            
            // Get the prefix for this guild to filter out commands
            const guildId = message.guild?.id;
            const defaultPrefix = process.env.HOST_ENV === "server" ? "\\" : "\\\\";
            const serverPrefix = guildId ? prefixService.getPrefix(guildId, defaultPrefix) : defaultPrefix;

            const recentTextMessage = messages.find(m => {
                if (m.id === message.id || m.author.bot) return false;
                if (!m.content || m.content.trim() === "") return false;
                
                // Exclude commands
                if (m.content.startsWith(serverPrefix) || m.content.startsWith("\\") || m.content.startsWith("\\\\")) return false;
                
                return true;
            });

            if (!recentTextMessage) {
                throw { code: "024" };
            }

            const embed = new EmbedBuilder()
                .setTitle("Recent Text")
                .setDescription(`${recentTextMessage.content}\n\n[Jump to Message](${recentTextMessage.url})`)
                .setColor("#ff6600")
                .setTimestamp(recentTextMessage.createdTimestamp)
                .setFooter({ 
                    text: `Posted by ${recentTextMessage.author.username}`, 
                    iconURL: recentTextMessage.author.displayAvatarURL({ dynamic: true }) 
                });

            await message.reply({ embeds: [embed] });
        } catch (err) {
            throw err.code ? err : { code: "014", err };
        }
    }
};

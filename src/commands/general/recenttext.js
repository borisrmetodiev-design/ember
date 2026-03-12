const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");
const prefixService = require("../../services/prefixService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("recenttext")
        .setDescription("Sends the most recent text message posted in this channel")
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("The channel to search in")
                .addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption(option =>
            option.setName("global")
                .setDescription("Search in the entire server")
        ),

    name: "recenttext",
    aliases: ["rt", "lasttext"],

    async executeSlash(interaction) {
        try {
            const targetChannel = interaction.options.getChannel("channel");
            const isGlobal = interaction.options.getBoolean("global");
            
            let recentTextMessage;

            if (isGlobal && interaction.guild) {
                recentTextMessage = await this.findGlobalRecentText(interaction.guild, interaction.id);
            } else {
                const channel = targetChannel || interaction.channel;
                const messages = await channel.messages.fetch({ limit: 50 });
                recentTextMessage = await this.findRecentTextInMessages(messages, interaction.guild?.id, interaction.id);
            }

            if (!recentTextMessage) {
                throw { code: "024" };
            }

            const embed = this.createEmbed(recentTextMessage);
            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            throw err.code ? err : { code: "014", err };
        }
    },

    async executePrefix(message, args) {
        try {
            const isGlobal = args.some(arg => arg.toLowerCase() === "-g" || arg.toLowerCase() === "--global");
            let targetChannel = null;

            const channelMention = args.find(arg => arg.match(/<#(\d+)>/));
            if (channelMention) {
                const channelId = channelMention.match(/<#(\d+)>/)[1];
                targetChannel = message.guild.channels.cache.get(channelId);
            }

            let recentTextMessage;

            if (isGlobal && message.guild) {
                recentTextMessage = await this.findGlobalRecentText(message.guild, message.id);
            } else {
                const channel = targetChannel || message.channel;
                const messages = await channel.messages.fetch({ limit: 50 });
                recentTextMessage = await this.findRecentTextInMessages(messages, message.guild?.id, message.id);
            }

            if (!recentTextMessage) {
                throw { code: "024" };
            }

            const embed = this.createEmbed(recentTextMessage);
            await message.reply({ embeds: [embed] });
        } catch (err) {
            throw err.code ? err : { code: "014", err };
        }
    },

    async findRecentTextInMessages(messages, guildId, triggerId) {
        const defaultPrefix = process.env.HOST_ENV === "server" ? "\\" : "\\\\";
        const serverPrefix = guildId ? prefixService.getPrefix(guildId, defaultPrefix) : defaultPrefix;

        return messages.find(m => {
            if (m.id === triggerId || m.author.bot) return false;
            if (!m.content || m.content.trim() === "") return false;
            
            // Exclude commands
            if (m.content.startsWith(serverPrefix) || m.content.startsWith("\\") || m.content.startsWith("\\\\")) return false;
            
            return true;
        });
    },

    async findGlobalRecentText(guild, triggerId) {
        const channels = guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText)
            .sort((a, b) => {
                const idA = BigInt(a.lastMessageId || 0);
                const idB = BigInt(b.lastMessageId || 0);
                return idB > idA ? 1 : (idB < idA ? -1 : 0);
            });

        let bestMessage = null;

        for (const [id, channel] of channels) {
            // Optimization: If the best message we've found is newer than the absolute latest message in this channel, we can stop.
            if (bestMessage && BigInt(channel.lastMessageId || 0) <= BigInt(bestMessage.id)) {
                break;
            }

            try {
                const messages = await channel.messages.fetch({ limit: 20 });
                const found = await this.findRecentTextInMessages(messages, guild.id, triggerId);
                
                if (found) {
                    if (!bestMessage || BigInt(found.id) > BigInt(bestMessage.id)) {
                        bestMessage = found;
                    }
                }
            } catch (err) {
                continue;
            }
        }
        return bestMessage;
    },

    createEmbed(message) {
        return new EmbedBuilder()
            .setTitle("Recent Text")
            .setDescription(`${message.content}\n\n[Jump to Message](${message.url})`)
            .setColor("#ff6600")
            .setTimestamp(message.createdTimestamp)
            .setFooter({ 
                text: `Posted by ${message.author.username} in #${message.channel.name}`, 
                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
            });
    }
};

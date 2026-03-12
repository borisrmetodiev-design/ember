const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("recentimage")
        .setDescription("Sends the most recent image posted in this channel")
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("The channel to search in")
                .addChannelTypes(ChannelType.GuildText)
        )
        .addBooleanOption(option =>
            option.setName("global")
                .setDescription("Search in the entire server")
        ),

    name: "recentimage",
    aliases: ["ri", "lastimage"],

    async executeSlash(interaction) {
        try {
            const targetChannel = interaction.options.getChannel("channel");
            const isGlobal = interaction.options.getBoolean("global");

            let recentImageMessage;

            if (isGlobal && interaction.guild) {
                recentImageMessage = await this.findGlobalRecentImage(interaction.guild, interaction.id);
            } else {
                const channel = targetChannel || interaction.channel;
                const messages = await channel.messages.fetch({ limit: 50 });
                recentImageMessage = await this.findRecentImageInMessages(messages, interaction.id);
            }

            if (!recentImageMessage) {
                throw { code: "023" };
            }

            const embed = this.createEmbed(recentImageMessage);
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

            let recentImageMessage;

            if (isGlobal && message.guild) {
                recentImageMessage = await this.findGlobalRecentImage(message.guild, message.id);
            } else {
                const channel = targetChannel || message.channel;
                const messages = await channel.messages.fetch({ limit: 50 });
                recentImageMessage = await this.findRecentImageInMessages(messages, message.id);
            }

            if (!recentImageMessage) {
                throw { code: "023" };
            }

            const embed = this.createEmbed(recentImageMessage);
            await message.reply({ embeds: [embed] });
        } catch (err) {
            throw err.code ? err : { code: "014", err };
        }
    },

    async findRecentImageInMessages(messages, triggerId) {
        return messages.find(m => 
            m.id !== triggerId && 
            !m.author.bot &&
            m.attachments.some(a => a.contentType?.startsWith("image/"))
        );
    },

    async findGlobalRecentImage(guild, triggerId) {
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
                const found = await this.findRecentImageInMessages(messages, triggerId);
                
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
        const attachment = message.attachments.find(a => a.contentType?.startsWith("image/"));
        const imageUrl = attachment.url;

        return new EmbedBuilder()
            .setTitle("Recent Image")
            .setDescription(`[Jump to Message](${message.url})`)
            .setImage(imageUrl)
            .setColor("#ff6600")
            .setTimestamp(message.createdTimestamp)
            .setFooter({ 
                text: `Posted by ${message.author.username} in #${message.channel.name}`, 
                iconURL: message.author.displayAvatarURL({ dynamic: true }) 
            });
    }
};

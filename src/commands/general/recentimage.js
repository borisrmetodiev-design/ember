const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("recentimage")
        .setDescription("Sends the most recent image posted in this channel"),

    name: "recentimage",
    aliases: ["ri", "lastimage"],

    async executeSlash(interaction) {
        try {
            const messages = await interaction.channel.messages.fetch({ limit: 50 });
            const recentImageMessage = messages.find(m => 
                m.id !== interaction.id && 
                !m.author.bot &&
                m.attachments.some(a => a.contentType?.startsWith("image/"))
            );

            if (!recentImageMessage) {
                throw { code: "023" };
            }

            const attachment = recentImageMessage.attachments.find(a => a.contentType?.startsWith("image/"));
            const imageUrl = attachment.url;

            const embed = new EmbedBuilder()
                .setTitle("Recent Image")
                .setDescription(`[Jump to Message](${recentImageMessage.url})`)
                .setImage(imageUrl)
                .setColor("#ff6600")
                .setTimestamp(recentImageMessage.createdTimestamp)
                .setFooter({ 
                    text: `Posted by ${recentImageMessage.author.username}`, 
                    iconURL: recentImageMessage.author.displayAvatarURL({ dynamic: true }) 
                });

            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            throw err.code ? err : { code: "014", err };
        }
    },

    async executePrefix(message) {
        try {
            const messages = await message.channel.messages.fetch({ limit: 50 });
            const recentImageMessage = messages.find(m => 
                m.id !== message.id && 
                !m.author.bot &&
                m.attachments.some(a => a.contentType?.startsWith("image/"))
            );

            if (!recentImageMessage) {
                throw { code: "023" };
            }

            const attachment = recentImageMessage.attachments.find(a => a.contentType?.startsWith("image/"));
            const imageUrl = attachment.url;

            const embed = new EmbedBuilder()
                .setTitle("Recent Image")
                .setDescription(`[Jump to Message](${recentImageMessage.url})`)
                .setImage(imageUrl)
                .setColor("#ff6600")
                .setTimestamp(recentImageMessage.createdTimestamp)
                .setFooter({ 
                    text: `Posted by ${recentImageMessage.author.username}`, 
                    iconURL: recentImageMessage.author.displayAvatarURL({ dynamic: true }) 
                });

            await message.reply({ embeds: [embed] });
        } catch (err) {
            throw err.code ? err : { code: "014", err };
        }
    }
};

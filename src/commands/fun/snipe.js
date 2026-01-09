const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snipe")
        .setDescription("Retrieve recently deleted messages in this channel")
        .addIntegerOption(option =>
            option.setName("count")
                .setDescription("Number of deleted messages to retrieve (max 10)")
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),
    
    name: "snipe",
    aliases: ["s"],

    async executeSlash(interaction) {
        const count = interaction.options.getInteger("count") || 1;
        await this.handleSnipe(interaction, count);
    },

    async executePrefix(message, args, client) {
        let count = parseInt(args[0]) || 1;
        if (isNaN(count) || count < 1) count = 1;
        if (count > 10) count = 10;
        await this.handleSnipe(message, count);
    },

    async handleSnipe(context, count) {
        const channelId = context.channelId || context.channel.id;
        const client = context.client;
        const snipes = client.snipes.get(channelId);

        if (!snipes || snipes.length === 0) {
            const embed = new EmbedBuilder()
                .setColor("#000000")
                .setTitle(`${process.env.emberERROR || "❌"} No Snipes Found`)
                .setDescription("There are no recently deleted messages in this channel.");
            if (context.isChatInputCommand?.()) return context.reply({ embeds: [embed], ephemeral: true });
            return context.reply({ embeds: [embed] });
        }

        const snipedMessages = snipes.slice(0, count);
        const embeds = snipedMessages.map((snipe) => {
            const embed = new EmbedBuilder()
                .setAuthor({ 
                    name: snipe.author?.tag || "Unknown User", 
                    iconURL: snipe.author?.displayAvatarURL({ dynamic: true }) || null
                })
                .setDescription(snipe.content || "*No text content*")
                .setColor("#000000")
                .setFooter({ text: "Message deleted" })
                .setTimestamp(snipe.timestamp);

            if (snipe.image) embed.setImage(snipe.image);
            return embed;
        });

        if (embeds.length === 0) return context.reply({ content: "Found no valid snipes." });

        return context.reply({ embeds });
    }
};

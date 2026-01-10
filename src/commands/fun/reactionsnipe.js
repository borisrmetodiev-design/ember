const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("reactionsnipe")
        .setDescription("Retrieve recently removed or added reactions in this channel")
        .addIntegerOption(option =>
            option.setName("count")
                .setDescription("Number of reactions to retrieve (max 10)")
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),
    
    name: "reactionsnipe",
    aliases: ["rsnipe", "rs"],

    async executeSlash(interaction) {
        const count = interaction.options.getInteger("count") || 1;
        await this.handleReactionSnipe(interaction, count);
    },

    async executePrefix(message, args, client) {
        let count = parseInt(args[0]) || 1;
        if (isNaN(count) || count < 1) count = 1;
        if (count > 10) count = 10;
        await this.handleReactionSnipe(message, count);
    },

    async handleReactionSnipe(context, count) {
        const channelId = context.channelId || context.channel.id;
        const client = context.client;
        const reactionsnipes = client.reactionsnipes.get(channelId);

        if (!reactionsnipes || reactionsnipes.length === 0) {
            const embed = new EmbedBuilder()
                .setColor("#000000")
                .setTitle(`${process.env.emberERROR} No Reactions Found`)
                .setDescription("There are no recently changed reactions in this channel.");
            if (context.isChatInputCommand?.()) return context.reply({ embeds: [embed], ephemeral: true });
            return context.reply({ embeds: [embed] });
        }

        const snipedReactions = reactionsnipes.slice(0, count);
        const embeds = snipedReactions.map((snipe) => {
            return new EmbedBuilder()
                .setAuthor({ 
                    name: snipe.user?.tag || "Unknown User", 
                    iconURL: snipe.user?.displayAvatarURL({ dynamic: true }) || null
                })
                .setDescription(`Reaction ${snipe.emoji} was **${snipe.action}**\n\n[Jump to Message](https://discord.com/channels/${context.guild.id}/${snipe.channelId}/${snipe.messageId})`)
                .setColor("#000000")
                .setFooter({ text: `Reaction ${snipe.action}` })
                .setTimestamp(snipe.timestamp);
        });

        if (embeds.length === 0) return context.reply({ content: "Found no valid reaction changes." });

        return context.reply({ embeds });
    }
};

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("editsnipe")
        .setDescription("Retrieve recently edited messages in this channel")
        .addIntegerOption(option =>
            option.setName("count")
                .setDescription("Number of edited messages to retrieve (max 10)")
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),
    
    name: "editsnipe",
    aliases: ["esnipe", "es"],

    async executeSlash(interaction) {
        const count = interaction.options.getInteger("count") || 1;
        await this.handleEditSnipe(interaction, count);
    },

    async executePrefix(message, args, client) {
        let count = parseInt(args[0]) || 1;
        if (isNaN(count) || count < 1) count = 1;
        if (count > 10) count = 10;
        await this.handleEditSnipe(message, count);
    },

    async handleEditSnipe(context, count) {
        const channelId = context.channelId || context.channel.id;
        const client = context.client;
        const editsnipes = client.editsnipes.get(channelId);

        if (!editsnipes || editsnipes.length === 0) {
            const embed = new EmbedBuilder()
                .setColor("#000000")
                .setTitle(`${process.env.emberERROR} No Edits Found`)
                .setDescription("There are no recently edited messages in this channel.");
            if (context.isChatInputCommand?.()) return context.reply({ embeds: [embed], ephemeral: true });
            return context.reply({ embeds: [embed] });
        }

        const snipedEdits = editsnipes.slice(0, count);
        const embeds = snipedEdits.map((snipe) => {
            return new EmbedBuilder()
                .setAuthor({ 
                    name: snipe.author?.tag || "Unknown User", 
                    iconURL: snipe.author?.displayAvatarURL({ dynamic: true }) || null
                })
                .setDescription(`**Before:** ${snipe.oldContent || "*No content*"}\n**After:** ${snipe.newContent || "*No content*"}\n\n[Jump to Message](https://discord.com/channels/${context.guild.id}/${snipe.channelId}/${snipe.messageId})`)
                .setColor("#000000")
                .setFooter({ text: "Message edited" })
                .setTimestamp(snipe.timestamp);
        });

        if (embeds.length === 0) return context.reply({ content: "Found no valid edits." });

        return context.reply({ embeds });
    }
};

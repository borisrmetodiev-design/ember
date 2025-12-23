const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "logs",

    /**
     * Send a startup log embed
     * @param {Client} client - Discord client
     */
    async sendStartupLog(client) {
        const channelId = process.env.LOGS_CHANNEL;
        const channel = client.channels.cache.get(channelId);
        if (!channel) return console.error("Logs channel not found.");

        const embed = new EmbedBuilder()
            .setColor("#00ff99")
            .setTitle("Bot Started")
            .setDescription(
                process.env.HOST_ENV === "local"
                    ? "Bot has started locally."
                    : "Bot has started on server hosting."
            )
            .setFooter({ text: "Ember Admin — Logs" })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    },

    /**
     * Send an update log embed
     * @param {Client} client - Discord client
     */
    async sendUpdateLog(client) {
        const channelId = process.env.LOGS_CHANNEL;
        const channel = client.channels.cache.get(channelId);
        if (!channel) return console.error("Logs channel not found.");

        const embed = new EmbedBuilder()
            .setColor("#ffaa00")
            .setTitle(" Bot Updated")
            .setDescription("The bot has been updated via `\\update`.")
            .setFooter({ text: "Ember Admin — Logs" })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    }
};
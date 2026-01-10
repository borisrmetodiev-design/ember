const { EmbedBuilder } = require("discord.js");
const { execSync } = require("child_process");

module.exports = {
    name: "logs",

    /**
     * Get the latest git commit info
     * @returns {string}
     */
    getCommitInfo() {
        try {
            return execSync('git log -1 --format="%h - %s (%cr)"', { encoding: 'utf8' }).trim();
        } catch (err) {
            console.error("Failed to fetch git commit info:", err.message);
            return "Unknown";
        }
    },

    /**
     * Send a startup log embed
     * @param {Client} client - Discord client
     */
    async sendStartupLog(client) {
        const channelId = process.env.LOGS_CHANNEL;
        const channel = client.channels.cache.get(channelId);
        if (!channel) return console.error("Logs channel not found.");

        const commitInfo = this.getCommitInfo();

        const embed = new EmbedBuilder()
            .setColor("#00ff99")
            .setTitle("Bot Started")
            .setDescription(
                process.env.HOST_ENV === "local"
                    ? "Bot has started locally."
                    : "Bot has started on server hosting."
            )
            .addFields({ name: "Latest Commit", value: `\`${commitInfo}\`` })
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

        const commitInfo = this.getCommitInfo();

        const embed = new EmbedBuilder()
            .setColor("#ffaa00")
            .setTitle("Bot Updated")
            .setDescription("The bot has been updated via `\\update`.")
            .addFields({ name: "Latest Commit", value: `\`${commitInfo}\`` })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    }
};
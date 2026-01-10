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
        const channelIds = [process.env.LOGS_CHANNEL, process.env.LOGS_CHANNEL_2].filter(Boolean);
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

        for (const channelId of channelIds) {
            console.log(`Attempting to send startup log to channel: ${channelId}`);
            const channel = client.channels.cache.get(channelId);
            if (channel) {
                await channel.send({ embeds: [embed] }).catch(err => console.error(`Failed to send startup log to ${channelId}:`, err));
            } else {
                console.error(`Logs channel ${channelId} not found in cache. Ensure the bot is in the server where this channel exists.`);
            }
        }
    },

    /**
     * Send an update log embed
     * @param {Client} client - Discord client
     */
    async sendUpdateLog(client) {
        const channelIds = [process.env.LOGS_CHANNEL, process.env.LOGS_CHANNEL_2].filter(Boolean);
        const commitInfo = this.getCommitInfo();

        const embed = new EmbedBuilder()
            .setColor("#ffaa00")
            .setTitle("Bot Updated")
            .setDescription("The bot has been updated via `\\update`.")
            .addFields({ name: "Latest Commit", value: `\`${commitInfo}\`` })
            .setTimestamp();

        for (const channelId of channelIds) {
            console.log(`Attempting to send update log to channel: ${channelId}`);
            const channel = client.channels.cache.get(channelId);
            if (channel) {
                await channel.send({ embeds: [embed] }).catch(err => console.error(`Failed to send update log to ${channelId}:`, err));
            } else {
                console.error(`Logs channel ${channelId} not found in cache.`);
            }
        }
    }
};
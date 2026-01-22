const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const os = require("os");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Shows detailed bot latency and system info"),

    name: "ping",

    // Shared embed builder
    buildEmbed(client, apiPing, wsPing, internalLag, requester) {
        try {
            const uptime = formatUptime(process.uptime());
            const memory = process.memoryUsage().rss / 1024 / 1024;
            const hostedOn = process.env.KOYEB_APP_NAME ? "Server (Koyeb)" : "Local Machine";

            return new EmbedBuilder()
                .setAuthor({
                    name: client.user.username,
                    iconURL: client.user.displayAvatarURL()
                })
                .setTitle("Pong!")
                .setColor("#ff6600")
                .addFields(
                    { name: "API Latency", value: `\`${apiPing}ms\``, inline: true },
                    { name: "WebSocket Ping", value: `\`${wsPing}ms\``, inline: true },
                    { name: "Internal Lag", value: `\`${internalLag}ms\``, inline: true },
                    { name: "Uptime", value: `\`${uptime}\``, inline: true },
                    { name: "Memory Usage", value: `\`${memory.toFixed(2)} MB\``, inline: true },
                    { name: "Hosting", value: `\`${hostedOn}\``, inline: true }
                )
                .setFooter({ text: `Requested by ${requester}` })
                .setTimestamp();
        } catch (err) {
            throw { code: "015", err };
        }
    },

    // Slash command
    async executeSlash(interaction) {
        const startTime = Date.now();
        try {
            const loadingEmoji = process.env.lumenLOAD || "⏳";

            let sent;
            try {
                sent = await interaction.reply({
                    content: `${loadingEmoji} Loading...`,
                    fetchReply: true
                });
            } catch (err) {
                throw { code: "014", err };
            }

            const apiPing = sent.createdTimestamp - interaction.createdTimestamp;
            const wsPing = interaction.client.ws.ping;
            const internalLag = Date.now() - startTime;

            if (isNaN(apiPing) || wsPing === undefined) {
                throw { code: "016" };
            }

            const embed = this.buildEmbed(
                interaction.client,
                apiPing,
                wsPing,
                internalLag,
                interaction.user.username
            );

            try {
                await interaction.editReply({
                    content: "",
                    embeds: [embed]
                });
            } catch (err) {
                throw { code: "014", err };
            }
        } catch (err) {
            throw err.code ? err : { code: "014", err };
        }
    },

    // Prefix command
    async executePrefix(message) {
        const startTime = Date.now();
        try {
            const loadingEmoji = process.env.lumenLOAD || "⏳";

            let sent;
            try {
                sent = await message.reply(`${loadingEmoji} Loading...`);
            } catch (err) {
                throw { code: "014", err };
            }

            const apiPing = sent.createdTimestamp - message.createdTimestamp;
            const wsPing = message.client.ws.ping;
            const internalLag = Date.now() - startTime;

            if (isNaN(apiPing) || wsPing === undefined) {
                throw { code: "016" };
            }

            const embed = this.buildEmbed(
                message.client,
                apiPing,
                wsPing,
                internalLag,
                message.author.username
            );

            try {
                await sent.edit({
                    content: "",
                    embeds: [embed]
                });
            } catch (err) {
                throw { code: "014", err };
            }
        } catch (err) {
            throw err.code ? err : { code: "014", err };
        }
    },
};

// Helper function
function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    return `${d}d ${h}h ${m}m ${s}s`;
}
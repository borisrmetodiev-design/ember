const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const os = require("os");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Shows detailed bot latency and system info"),

    name: "ping",

    // Shared embed builder
    buildEmbed(client, apiPing, wsPing, requester) {
        try {
            const uptime = formatUptime(process.uptime());
            const memory = process.memoryUsage().rss / 1024 / 1024;
            const cpu = os.loadavg()[0].toFixed(2);
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
                    { name: "Uptime", value: `\`${uptime}\``, inline: true },
                    { name: "Memory Usage", value: `\`${memory.toFixed(2)} MB\``, inline: true },
                    { name: "CPU Load", value: `\`${cpu}\``, inline: true },
                    { name: "Hosting", value: `\`${hostedOn}\``, inline: true }
                )
                .setTimestamp()
                .setTimestamp();
        } catch (err) {
            throw { code: "015", err }; // External APIs failed to load (os/process info)
        }
    },

    // Slash command
    async executeSlash(interaction) {
        try {
            const loadingEmoji = process.env.emberLOAD || "⏳";

            let sent;
            try {
                sent = await interaction.reply({
                    content: `${loadingEmoji} Loading...`,
                    fetchReply: true
                });
            } catch (err) {
                throw { code: "014", err }; // Discord API request failed
            }

            const apiPing = sent.createdTimestamp - interaction.createdTimestamp;
            const wsPing = interaction.client.ws.ping;

            if (isNaN(apiPing) || wsPing === undefined) {
                throw { code: "016" }; // Ping calculation failed
            }

            const embed = this.buildEmbed(
                interaction.client,
                apiPing,
                wsPing,
                interaction.user.username
            );

            try {
                await interaction.editReply({
                    content: "",
                    embeds: [embed]
                });
            } catch (err) {
                throw { code: "014", err }; // Discord API request failed
            }
        } catch (err) {
            throw err.code ? err : { code: "014", err }; // fallback
        }
    },

    // Prefix command
    async executePrefix(message) {
        try {
            const loadingEmoji = process.env.emberLOAD;

            let sent;
            try {
                sent = await message.reply(`${loadingEmoji} Loading...`);
            } catch (err) {
                throw { code: "014", err }; // Discord API request failed
            }

            const apiPing = sent.createdTimestamp - message.createdTimestamp;
            const wsPing = message.client.ws.ping;

            if (isNaN(apiPing) || wsPing === undefined) {
                throw { code: "016" }; // Ping calculation failed
            }

            const embed = this.buildEmbed(
                message.client,
                apiPing,
                wsPing,
                message.author.username
            );

            try {
                await sent.edit({
                    content: "",
                    embeds: [embed]
                });
            } catch (err) {
                throw { code: "014", err }; // Discord API request failed
            }
        } catch (err) {
            throw err.code ? err : { code: "014", err }; // fallback
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
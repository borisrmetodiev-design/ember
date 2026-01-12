const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require("discord.js");

// Node-fetch v3 ESM-compatible import for CommonJS
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = {
    data: new SlashCommandBuilder()
        .setName("tiktokrepost")
        .setDescription("Repost a TikTok video with metadata")
        .addStringOption(option =>
            option.setName("url")
                .setDescription("The TikTok video URL")
                .setRequired(true)
        ),

    name: "tiktokrepost",
    aliases: ["ttrepost", "ttr"],

    async executeSlash(interaction) {
        try {
            await interaction.deferReply();
        } catch (err) {
             if (err.code === 10062) {
                console.warn("[WARN] Interaction timed out during deferReply in tiktokrepost.");
                return;
            }
            throw err;
        }
        const url = interaction.options.getString("url");

        try {
            const data = await this.fetchTikTokData(url);
            if (!data) throw new Error("Could not fetch TikTok data.");

            const embed = this.buildEmbed(data);
            
            // Fetch video buffer
            const videoRes = await fetch(data.play);
            const buffer = Buffer.from(await videoRes.arrayBuffer());
            const videoAttachment = new AttachmentBuilder(buffer, { name: "tiktok.mp4" });

            try {
                // Try to upload
                await interaction.editReply({
                    embeds: [embed],
                    files: [videoAttachment]
                });
            } catch (err) {
                // If it fails with "Request entity too large" (code 40005) or similar, fallback
                if (err.code === 40005 || err.status === 413) {
                    const vxUrl = url.replace("tiktok.com", "vxtiktok.com");
                    await interaction.editReply({ 
                        content: vxUrl,
                        embeds: [embed],
                        files: [] 
                    });
                } else {
                    throw err; 
                }
            }
        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: `Failed to repost TikTok: ${err.message || "Unknown error"}` });
        }
    },

    async executePrefix(message, args) {
        const url = args[0];
        if (!url) return message.reply("Please provide a TikTok URL!");

        const loadingEmoji = process.env.lumenLOAD;
        const sent = await message.reply(`${loadingEmoji} Fetching TikTok...`);

        try {
            const data = await this.fetchTikTokData(url);
            if (!data) throw new Error("Could not fetch TikTok data.");

            const embed = this.buildEmbed(data);

            // Fetch video buffer
            const videoRes = await fetch(data.play);
            const buffer = Buffer.from(await videoRes.arrayBuffer());
            const videoAttachment = new AttachmentBuilder(buffer, { name: "tiktok.mp4" });

            try {
                await sent.edit({
                    content: "",
                    embeds: [embed],
                    files: [videoAttachment]
                });
            } catch (err) {
                if (err.code === 40005 || err.status === 413) {
                    const vxUrl = url.replace("tiktok.com", "vxtiktok.com");
                    await sent.edit({
                        content: vxUrl,
                        embeds: [embed],
                        files: []
                    });
                } else {
                    throw err;
                }
            }
        } catch (err) {
            console.error(err);
            await sent.edit({ content: `Failed to repost TikTok: ${err.message || "Unknown error"}` });
        }
    },

    async fetchTikTokData(url) {
        try {
            const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
            const body = await res.json();
            if (body.code !== 0) throw new Error(body.msg || "TikWM API error");
            return body.data;
        } catch (err) {
            throw err;
        }
    },

    formatCount(count) {
        if (count >= 1000000) return (count / 1000000).toFixed(1) + "m";
        if (count >= 1000) return (count / 1000).toFixed(1) + "k";
        return count.toString();
    },

    buildEmbed(data) {
        const likes = this.formatCount(data.digg_count);
        const reposts = this.formatCount(data.share_count); // TikWM share_count is often what people call reposts
        const views = this.formatCount(data.play_count);
        const comments = this.formatCount(data.comment_count);

        const footerText = `❤️ ${likes} | 🔁 ${reposts} | 👁️ ${views} | 💬 ${comments}`;

        return new EmbedBuilder()
            .setColor("#000000")
            .setAuthor({ name: `@${data.author.unique_id}`, iconURL: data.author.avatar })
            .setTitle(data.title || "TikTok Video")
            .setURL(`https://www.tiktok.com/@${data.author.unique_id}/video/${data.id}`)
            .setFooter({ text: footerText });
    }
};

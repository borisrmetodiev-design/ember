const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Node-fetch v3 ESM-compatible import for CommonJS
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

const SUPPORTED_EXTENSIONS = [
    "mp4", "mov", "avi", "mkv", "webm",
    "mp3", "aac", "wav", "flac", "m4a", "ogg"
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("spt")
        .setDescription("Transcribe audio or video to text")
        .addAttachmentOption(option =>
            option.setName("file")
                .setDescription("The audio or video file to transcribe")
                .setRequired(true)
        ),

    name: "spt",
    aliases: ["speechtotext"],

    async executeSlash(interaction) {
        try {
            await interaction.deferReply();
        } catch (err) {
             if (err.code === 10062) {
                console.warn("[WARN] Interaction timed out during deferReply in spt.");
                return;
            }
            throw err;
        }
        const attachment = interaction.options.getAttachment("file");

        try {
            const text = await this.processTranscription(attachment);
            const embed = this.buildTranscriptionEmbed(text, attachment, interaction.user);
            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: `Failed to transcribe: ${err.message || "Unknown error"}` });
        }
    },

    async executePrefix(message, args) {
        let attachment = message.attachments.first();

        // Check for attachment in replied message if not in current
        if (!attachment && message.reference) {
            const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
            attachment = repliedMsg.attachments.first();
        }

        if (!attachment) {
            return message.reply("Please attach an audio/video file or reply to one!");
        }

        const loadingEmoji = process.env.lumenLOAD || "⏳";
        const sent = await message.reply(`${loadingEmoji} Transcribing...`);

        try {
            const text = await this.processTranscription(attachment);
            const embed = this.buildTranscriptionEmbed(text, attachment, message.author);
            await sent.edit({ content: "", embeds: [embed] });
        } catch (err) {
            console.error(err);
            await sent.edit({ content: `Failed to transcribe: ${err.message || "Unknown error"}` });
        }
    },

    buildTranscriptionEmbed(text, attachment, user) {
        return new EmbedBuilder()
            .setColor("#000000")
            .setAuthor({ 
                name: `Transcription for ${user.username}`, 
                iconURL: user.displayAvatarURL({ dynamic: true }) 
            })
            .setDescription(text)
            .setFooter({ 
                text: "Whisper Large V3 via Groq"
            })
            .setTimestamp();
    },

    async processTranscription(attachment) {
        const url = attachment.url;
        const fileName = attachment.name.toLowerCase();
        const ext = fileName.split(".").pop();

        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
            throw new Error(`Unsupported file format. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
        }

        // Groq/OpenAI limit is 25MB
        if (attachment.size > 25 * 1024 * 1024) {
            throw new Error("File size exceeds 25MB limit.");
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new Error("GROQ_API_KEY is not configured in the environment.");
        }

        // Download file
        const response = await Promise.race([
            fetch(url),
            new Promise((_, reject) => setTimeout(() => reject(new Error("File download timed out")), 20000))
        ]);
        const buffer = Buffer.from(await response.arrayBuffer());

        // Create temporary file for Groq API
        const tempFilePath = path.join(os.tmpdir(), `spt_${Date.now()}_${attachment.name}`);
        fs.writeFileSync(tempFilePath, buffer);

        try {
            const { FormData } = await import("formdata-node");
            const { fileFromPath } = await import("formdata-node/file-from-path");

            const form = new FormData();
            form.set("file", await fileFromPath(tempFilePath));
            form.set("model", "whisper-large-v3");
            form.set("response_format", "json");

            const groqRes = await Promise.race([
                fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: form
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Groq API timed out")), 30000))
            ]);

            const body = await groqRes.json();
            
            if (!groqRes.ok) {
                throw new Error(body.error?.message || `Groq API error: ${groqRes.statusText}`);
            }

            let text = body.text || "No speech detected.";
            
            // Discord message limit is 2000 chars
            if (text.length > 2000) {
                text = text.substring(0, 1997) + "...";
            }

            return text;
        } finally {
            // Clean up temp file
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        }
    }
};

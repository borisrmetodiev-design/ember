const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const sharp = require("sharp");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("imagetogif")
        .setDescription("Convert an image to a GIF with minimal compression")
        .addAttachmentOption(option =>
            option
                .setName("image")
                .setDescription("The image to convert")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName("ephemeral")
                .setDescription("Whether the reply should be ephemeral")
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName("spoiler")
                .setDescription("Whether the output GIF should be a spoiler")
                .setRequired(false)
        ),

    name: "imagetogif",

    // Shared converter
    async convertToGif(buffer) {
        try {
            return await sharp(buffer, { animated: false })
                .gif({
                    reoptimise: false,   // lowest compression
                    effort: 1            // fastest, least compressed
                })
                .toBuffer();
        } catch (err) {
            throw { code: "011", err }; // Sharp API failed to load / conversion error
        }
    },

    // Slash command
    async executeSlash(interaction) {
        try {
            const loadingEmoji = process.env.emberLOAD;

            const image = interaction.options.getAttachment("image");
            const ephemeral = interaction.options.getBoolean("ephemeral") ?? false;
            const spoiler = interaction.options.getBoolean("spoiler") ?? false;

            if (!image) throw { code: "003" }; // No asset set
            if (image.contentType && image.contentType.includes("gif")) {
                throw { code: "010" }; // File is already a GIF format
            }

            await interaction.reply({
                content: `${loadingEmoji} Converting your image...`,
                ephemeral,
                fetchReply: true
            });

            // Fetch image buffer
            let buffer;
            try {
                const response = await fetch(image.url);
                buffer = Buffer.from(await response.arrayBuffer());
            } catch (err) {
                throw { code: "012", err }; // External API (fetch) failed
            }

            // Convert to GIF
            const gifBuffer = await this.convertToGif(buffer);
            if (!gifBuffer) throw { code: "013" }; // File conversion failed

            const fileName = spoiler ? `SPOILER_output.gif` : `output.gif`;
            const attachment = new AttachmentBuilder(gifBuffer, { name: fileName });

            await interaction.editReply({
                content: "",
                files: [attachment]
            });
        } catch (err) {
            throw err.code ? err : { code: "013", err }; // fallback to conversion failed
        }
    },

    // Prefix command
    async executePrefix(message) {
        try {
            const loadingEmoji = process.env.emberLOAD;

            const image = message.attachments.first();
            if (!image) throw { code: "003" }; // No asset set
            if (image.contentType && image.contentType.includes("gif")) {
                throw { code: "010" }; // File is already a GIF format
            }

            const sent = await message.reply(`${loadingEmoji} Converting your image...`);

            // Fetch image buffer
            let buffer;
            try {
                const response = await fetch(image.url);
                buffer = Buffer.from(await response.arrayBuffer());
            } catch (err) {
                throw { code: "011", err }; // External API (fetch) failed
            }

            // Convert to GIF
            const gifBuffer = await this.convertToGif(buffer);
            if (!gifBuffer) throw { code: "012" }; // File conversion failed

            const attachment = new AttachmentBuilder(gifBuffer, { name: "output.gif" });

            await sent.edit({
                content: "",
                files: [attachment]
            });
        } catch (err) {
            throw err.code ? err : { code: "013", err }; // fallback
        }
    }
};
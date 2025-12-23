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

    // 🔥 Shared converter
    async convertToGif(buffer) {
        return await sharp(buffer, { animated: false })
            .gif({
                reoptimise: false,   // lowest compression
                effort: 1            // fastest, least compressed
            })
            .toBuffer();
    },

    // 🔥 Slash command
    async executeSlash(interaction) {
        const loadingEmoji = process.env.emberLOAD;

        const image = interaction.options.getAttachment("image");
        const ephemeral = interaction.options.getBoolean("ephemeral") ?? false;
        const spoiler = interaction.options.getBoolean("spoiler") ?? false;

        await interaction.reply({
            content: `${loadingEmoji} Converting your image...`,
            ephemeral,
            fetchReply: true
        });

        // Fetch image buffer
        const response = await fetch(image.url);
        const buffer = Buffer.from(await response.arrayBuffer());

        // Convert to GIF
        const gifBuffer = await this.convertToGif(buffer);

        const fileName = spoiler ? `SPOILER_output.gif` : `output.gif`;
        const attachment = new AttachmentBuilder(gifBuffer, { name: fileName });

        await interaction.editReply({
            content: "",
            files: [attachment]
        });
    },

    // 🔥 Prefix command
    async executePrefix(message) {
        const loadingEmoji = process.env.emberLOAD;

        if (!message.attachments.first()) {
            return message.reply("Please attach an image to convert.");
        }

        const sent = await message.reply(`${loadingEmoji} Converting your image...`);

        const image = message.attachments.first();

        const response = await fetch(image.url);
        const buffer = Buffer.from(await response.arrayBuffer());

        const gifBuffer = await this.convertToGif(buffer);

        const attachment = new AttachmentBuilder(gifBuffer, { name: "output.gif" });

        await sent.edit({
            content: "",
            files: [attachment]
        });
    }
};
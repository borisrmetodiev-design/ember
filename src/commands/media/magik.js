const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const sharp = require("sharp");

// Node-fetch v3 ESM-compatible import for CommonJS
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = {
    data: new SlashCommandBuilder()
        .setName("magik")
        .setDescription("Apply a content-aware scale (magik) effect to an image")
        .addAttachmentOption(option =>
            option
                .setName("image")
                .setDescription("The image to magik")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName("spoiler")
                .setDescription("Whether the output should be a spoiler")
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName("gif")
                .setDescription("Whether to convert the result to a GIF")
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName("ephemeral")
                .setDescription("Whether the reply should be ephemeral")
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName("intensity")
                .setDescription("The intensity of the magik effect (0-10)")
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(10)
        ),

    name: "magik",
    aliases: ["cms", "contentaware"],

    async applyMagik(imageUrl, intensity = 2) {
        try {
            const apiRes = await fetch(`https://nekobot.xyz/api/imagegen?type=magik&image=${encodeURIComponent(imageUrl)}&intensity=${intensity}`);
            const data = await apiRes.json();

            if (!data.success) {
                throw new Error(data.message || "Failed to apply magik effect");
            }

            const imgRes = await fetch(data.message);
            if (!imgRes.ok) throw new Error("Failed to fetch generated image");
            return Buffer.from(await imgRes.arrayBuffer());
        } catch (err) {
            throw { code: "015", err }; // External APIs failed to load
        }
    },

    async convertToGif(buffer) {
        try {
            return await sharp(buffer)
                .gif({
                    effort: 1
                })
                .toBuffer();
        } catch (err) {
            throw { code: "012", err }; // File conversion failed
        }
    },

    async executeSlash(interaction) {
        const image = interaction.options.getAttachment("image");
        const spoiler = interaction.options.getBoolean("spoiler") ?? false;
        const gif = interaction.options.getBoolean("gif") ?? false;
        const ephemeral = interaction.options.getBoolean("ephemeral") ?? false;
        const intensity = interaction.options.getInteger("intensity") ?? 2;
        const loadingEmoji = process.env.lumenLOAD;

        await interaction.reply({ content: `${loadingEmoji} Processing magik...`, ephemeral });

        try {
            let buffer = await this.applyMagik(image.url, intensity);

            if (gif) {
                buffer = await this.convertToGif(buffer);
            }

            const extension = gif ? "gif" : "png";
            const fileName = spoiler ? `SPOILER_magik.${extension}` : `magik.${extension}`;
            const attachment = new AttachmentBuilder(buffer, { name: fileName });

            await interaction.editReply({
                content: "",
                files: [attachment]
            });
        } catch (err) {
            const errorMessage = err.err?.message || "Failed to process image.";
            await interaction.editReply({ content: `Error: ${errorMessage}` });
        }
    },

    async executePrefix(message, args) {
        const image = message.attachments.first() || (message.reference ? (await message.fetchReference()).attachments.first() : null);
        const loadingEmoji = process.env.lumenLOAD || "⌛";

        if (!image) {
            return message.reply("Please attach an image or reply to one!");
        }

        const gif = args.includes("gif");
        const spoiler = args.includes("spoiler");
        
        // Find intensity in args (e.g., !magik 5 or intensity:5)
        let intensity = 2;
        const intensityArg = args.find(arg => !isNaN(arg) && parseInt(arg) >= 0 && parseInt(arg) <= 10);
        if (intensityArg) intensity = parseInt(intensityArg);

        const sent = await message.reply(`${loadingEmoji} Processing magik (Intensity: ${intensity})...`);

        try {
            let buffer = await this.applyMagik(image.url, intensity);

            if (gif) {
                buffer = await this.convertToGif(buffer);
            }

            const extension = gif ? "gif" : "png";
            const fileName = spoiler ? `SPOILER_magik.${extension}` : `magik.${extension}`;
            const attachment = new AttachmentBuilder(buffer, { name: fileName });

            await sent.edit({
                content: "",
                files: [attachment]
            });
        } catch (err) {
            const errorMessage = err.err?.message || "Failed to process image.";
            await sent.edit({ content: `Error: ${errorMessage}` });
        }
    }
};

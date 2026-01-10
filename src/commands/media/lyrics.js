const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const GeniusService = require("../../services/genius");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("lyrics")
        .setDescription("Get lyrics for a song")
        .addStringOption(option =>
            option.setName("song")
                .setDescription("The song to search for")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    name: "lyrics",
    aliases: ["ly"],

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        if (!focusedValue) return interaction.respond([]);

        try {
            const results = await GeniusService.searchSongs(focusedValue);
            const choices = results.slice(0, 25).map(song => ({
                name: `${song.title} - ${song.artist}`,
                value: `${song.title} ${song.artist}`
            }));
            await interaction.respond(choices);
        } catch (err) {
            await interaction.respond([]);
        }
    },

    async executeSlash(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString("song");

        try {
            await this.processLyrics(interaction, query, true);
        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: `Error: ${err.message || "Unknown error occurred"}` });
        }
    },

    async executePrefix(message, args) {
        const query = args.join(" ");
        if (!query) {
            return message.reply("Please provide a song name!");
        }

        const loadingEmoji = process.env.lumenLOAD || "⏳";
        const sent = await message.reply(`${loadingEmoji} Searching for lyrics...`);

        try {
            await this.processLyrics(sent, query, false, message.author);
        } catch (err) {
            console.error(err);
            await sent.edit({ content: `Error: ${err.message || "Unknown error occurred"}` });
        }
    },

    async processLyrics(context, query, isSlash, user) {
        const targetUser = isSlash ? context.user : user;
        const song = await GeniusService.searchSong(query);

        if (!song) {
            const content = `No lyrics found for **${query}**.`;
            return isSlash ? context.editReply({ content }) : context.edit({ content: "", embeds: [
                new EmbedBuilder().setColor("#ff0000").setDescription(content)
            ] });
        }

        const lyrics = await GeniusService.fetchLyrics(song.url);
        
        // Split lyrics into pages (max 2000 chars per page for better readability)
        const pages = this.splitLyrics(lyrics, 2000);
        let currentPage = 0;

        const buildMessage = (pageIdx) => {
            const embed = new EmbedBuilder()
                .setColor("#ffff00")
                .setAuthor({ 
                    name: `${song.title} - ${song.artist}`, 
                    iconURL: song.image,
                    url: song.url
                })
                .setThumbnail(song.image)
                .setDescription(pages[pageIdx])
                .setFooter({ 
                    text: `Page ${pageIdx + 1} of ${pages.length} | Lyrics via Genius` 
                });

            if (pages.length <= 1) return { embeds: [embed], components: [] };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("prev")
                    .setLabel("Previous")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageIdx === 0),
                new ButtonBuilder()
                    .setCustomId("next")
                    .setLabel("Next")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageIdx === pages.length - 1)
            );

            return { embeds: [embed], components: [row] };
        };

        const initialMsg = isSlash ? await context.editReply(buildMessage(0)) : await context.edit({ content: "", ...buildMessage(0) });
        
        if (pages.length <= 1) return;

        const collector = initialMsg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000 // 1 minute
        });

        collector.on("collect", async (i) => {
            if (i.user.id !== targetUser.id) {
                return i.reply({ content: "Only the command user can navigate pages.", ephemeral: true });
            }

            if (i.customId === "prev") {
                currentPage--;
            } else if (i.customId === "next") {
                currentPage++;
            }

            await i.update(buildMessage(currentPage));
        });

        collector.on("end", () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("prev").setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId("next").setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(true)
            );
            initialMsg.edit({ components: [disabledRow] }).catch(() => {});
        });
    },

    splitLyrics(text, maxLength) {
        if (text.length <= maxLength) return [text];

        const chunks = [];
        let currentPos = 0;

        while (currentPos < text.length) {
            let chunk = text.substring(currentPos, currentPos + maxLength);
            
            if (currentPos + maxLength < text.length) {
                const lastNewline = chunk.lastIndexOf("\n");
                if (lastNewline > maxLength * 0.7) {
                    chunk = chunk.substring(0, lastNewline);
                }
            }

            chunks.push(chunk);
            currentPos += chunk.length;
        }

        return chunks;
    }
};

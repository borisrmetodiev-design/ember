const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const fs = require("fs");
const path = require("path");

// Node-fetch v3 ESM-compatible import for CommonJS
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");
const MUSIC_EMOJI = () => process.env.lumenMUSIC || "🎵";

function loadDB() {
    if (!fs.existsSync(dataPath)) return { users: {} };
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

const topFMLogic = {
    async getLastFMUsername(discordId) {
        const db = loadDB();
        return db.users[discordId] || null;
    },

    periodMap: {
        weekly: "7day",
        monthly: "1month",
        quarterly: "3month",
        half: "6month",
        yearly: "12month",
        overall: "overall"
    },

    periodLabels: {
        "7day": "Weekly",
        "1month": "Monthly",
        "3month": "Quarterly",
        "6month": "Half Year",
        "12month": "Yearly",
        "overall": "Overall"
    },

    async fetchTopData(username, mode, period, page = 1) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) throw { code: "006" };

        let method;
        let rootProperty;
        let itemProperty;

        switch (mode) {
            case "artist":
                method = "user.gettopartists";
                rootProperty = "topartists";
                itemProperty = "artist";
                break;
            case "track":
                method = "user.gettoptracks";
                rootProperty = "toptracks";
                itemProperty = "track";
                break;
            case "album":
                method = "user.gettopalbums";
                rootProperty = "topalbums";
                itemProperty = "album";
                break;
            default:
                throw new Error("Invalid mode");
        }

        const url = `https://ws.audioscrobbler.com/2.0/?method=${method}&user=${encodeURIComponent(
            username
        )}&api_key=${apiKey}&format=json&limit=10&page=${page}&period=${period}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            throw { code: "019", message: data.message };
        }
        
        const items = data[rootProperty]?.[itemProperty] || [];
        // total pages usually in data[rootProperty]['@attr'].totalPages
        const totalPages = data[rootProperty]?.["@attr"]?.totalPages || 1;

        return { items, totalPages: parseInt(totalPages) };
    },

    async fetchAutocomplete(mode, query) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey || !query) return [];

        let method;

        switch (mode) {
            case "artist":
                method = "artist.search";
                break;
            case "album":
                method = "album.search";
                break;
            case "track":
                method = "track.search";
                break;
            default:
                return [];
        }

        const url = `https://ws.audioscrobbler.com/2.0/?method=${method}&${mode}=${encodeURIComponent(query)}&api_key=${apiKey}&format=json&limit=10`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.error) return [];

            if (mode === "artist") {
                const globalResults = data.results?.artistmatches?.artist || [];
                return globalResults
                    .filter(a => a.name)
                    .map(a => ({ name: a.name, value: a.name }))
                    .slice(0, 25);
            } else if (mode === "album") {
                const globalResults = data.results?.albummatches?.album || [];
                return globalResults
                    .filter(a => a.name && a.artist)
                    .map(a => ({ 
                        name: `${a.name} - ${a.artist}`, 
                        value: `${a.name}` // For topfm we just want name usually, but logic uses name to find in list 
                    }))
                    .slice(0, 25);
            } else if (mode === "track") {
                const globalResults = data.results?.trackmatches?.track || [];
                return globalResults
                    .filter(t => t.name && t.artist)
                    .map(t => ({ 
                        name: `${t.name} - ${t.artist}`, 
                        value: `${t.name}` 
                    }))
                    .slice(0, 25);
            }
        } catch (err) {
            console.error("Autocomplete fetch error: ", err);
            return [];
        }
        return [];
    },

    buildNoAccountEmbed(targetUser) {
        return new EmbedBuilder()
            .setColor("#ff3300")
            .setAuthor({
                name: `${targetUser.username}`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setTitle(`${MUSIC_EMOJI()} No Last.fm Account Linked`)
            .setDescription(
                `There's no LastFM account associated with ${targetUser}.\n` +
                `Please run the \`lastfmsetup\` command to connect accounts.`
            )
            .setTimestamp();
    },

    async getCurrentTrack(username) {
        const apiKey = process.env.LASTFM_API_KEY;
        const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(username)}&api_key=${apiKey}&format=json&limit=1`;
        
        try {
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.error) return null;
            
            const track = data.recenttracks?.track?.[0];
            if (!track) return null;
            
            return {
                artist: track.artist["#text"] || track.artist.name,
                album: track.album["#text"],
                name: track.name,
                image: track.image?.find(i => i.size === "large")?.["#text"]
            };
        } catch (e) {
            return null;
        }
    },

    async getRank(username, mode, period, targetName) {
        const apiKey = process.env.LASTFM_API_KEY;
        let method = "";
        let limit = 1000; // Search top 1000
        
        if (mode === "artist") method = "user.gettopartists";
        else if (mode === "album") method = "user.gettopalbums";
        else if (mode === "track") method = "user.gettoptracks";

        const url = `https://ws.audioscrobbler.com/2.0/?method=${method}&user=${encodeURIComponent(username)}&api_key=${apiKey}&format=json&period=${period}&limit=${limit}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.error) throw { code: "019", message: data.message };

        let items = [];
        if (mode === "artist") items = data.topartists?.artist || [];
        else if (mode === "album") items = data.topalbums?.album || [];
        else if (mode === "track") items = data.toptracks?.track || [];

        const index = items.findIndex(i => {
           if (mode === "artist") return i.name.toLowerCase() === targetName.toLowerCase();
           // For album/track, simple check on name, strictly we should check artist too but topfm logic was simplified
           // If user selected autofill, they have exact name.
           // Last.fm top list items have 'name' property.
           return i.name.toLowerCase() === targetName.toLowerCase();
        });

        if (index === -1) return null;
        return { item: items[index], rank: index + 1 };
    },

    async execute(interactionOrMessage, isSlash, targetUser, mode, periodInput, queryInput = null) {
        const loadingEmoji = process.env.lumenLOAD || "⏳";
        const user = targetUser || (isSlash ? interactionOrMessage.user : interactionOrMessage.author);
        
        let response;
        if (isSlash) {
            try {
                if (!interactionOrMessage.deferred && !interactionOrMessage.replied) {
                    await interactionOrMessage.deferReply();
                }
            } catch (err) {
                console.error("Error deferring reply in topfm:", err);
                return;
            }
        } else {
            response = await interactionOrMessage.reply({ content: `${loadingEmoji} Fetching data...` });
        }

        const username = await this.getLastFMUsername(user.id);
        if (!username) {
            const embed = this.buildNoAccountEmbed(user);
            return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [embed] }) : response.edit({ content: "", embeds: [embed] });
        }

        const period = this.periodMap[periodInput] || "7day";
        const periodLabel = this.periodLabels[period];

        // Determine if we are doing Rank Check or List
        let targetName = queryInput;

        // If no query, check current track
        if (!targetName) {
             const current = await this.getCurrentTrack(username);
             if (current) {
                 if (mode === "artist") targetName = current.artist;
                 else if (mode === "album") targetName = current.album;
                 else if (mode === "track") targetName = current.name;
             }
        }
        
        // If we have a targetName, do Rank Check
        // BUT only if we found a match (or user typed one).
        // If user didn't type one, and no current track, we fall back to list.
        if (targetName) {
            try {
                const rankData = await this.getRank(username, mode, period, targetName);
                
                const embed = new EmbedBuilder()
                    .setColor("#ff6600")
                    .setAuthor({
                        name: `${user.username}`,
                        iconURL: user.displayAvatarURL({ dynamic: true })
                    })
                    .setTimestamp();

                // Get Best Image Helper
                const getBestImage = (images) => {
                    if (!images || !Array.isArray(images) || images.length === 0) return "";
                    return images[images.length - 1]["#text"];
                };

                if (rankData) {
                    const { item, rank } = rankData;
                    const plays = parseInt(item.playcount).toLocaleString();
                    const img = getBestImage(item.image) || 
                                (mode === "track" && getBestImage(item.album?.image)); // Track image fallback

                    if (img) embed.setThumbnail(img);
                    
                    let title = item.name;
                    if (mode === "track" || mode === "album") title = `${item.name} - ${item.artist.name}`;
                    
                    embed.setTitle(`${title}`);
                    embed.setURL(item.url);
                    embed.setDescription(
                        `Rank: **#${rank}** (${periodLabel})\n` +
                        `Plays: **${plays}**`
                    );
                } else {
                    embed.setColor("#ff3300")
                        .setTitle(`${MUSIC_EMOJI()} Not in Top Lists`)
                        .setDescription(
                            `**${targetName}** was not found in your **${periodLabel}** top ${mode}s (Top 1000).`
                        );
                }

                 return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [embed], components: [] }) : response.edit({ content: "", embeds: [embed], components: [] });

            } catch (err) {
                console.error(err);
                const errEmbed = new EmbedBuilder()
                    .setColor("#ff3300").setTitle("Error").setDescription("Failed to fetch rank data.");
                 return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [errEmbed] }) : response.edit({ content: "", embeds: [errEmbed] });
            }
        }

        // --- LIST MODE FALLBACK (No query, Not listening/No album info) ---
        let currentPage = 1;

        // Reuse fetchTopData from this object
        const getEmbedAndButtons = async (page) => {
             const { items, totalPages } = await this.fetchTopData(username, mode, period, page);

            if (!items || items.length === 0) {
                 const noDataEmbed = new EmbedBuilder()
                    .setColor("#ff3300")
                    .setAuthor({
                        name: `${user.username}`,
                        iconURL: user.displayAvatarURL({ dynamic: true })
                    })
                    .setTitle(`${MUSIC_EMOJI()} No Data Found`)
                    .setDescription(`No top ${mode}s found for ${username} in the ${periodLabel.toLowerCase()} period.`)
                    .setTimestamp();
                 return { embed: noDataEmbed, buttons: [] };
             }

             const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({
                    name: `${user.username}'s Top ${mode.charAt(0).toUpperCase() + mode.slice(1)}s`,
                    iconURL: user.displayAvatarURL({ dynamic: true })
                })
                .setTitle(`${MUSIC_EMOJI()} ${periodLabel} Top ${mode.charAt(0).toUpperCase() + mode.slice(1)}s`)
                .setDescription(
                    items.map((item, index) => {
                        let itemName = item.name;
                        let secondaryInfo = "";
                        const globalIndex = (page - 1) * 10 + index + 1;
                        
                        if (mode === "artist") {
                            secondaryInfo = `(${parseInt(item.playcount).toLocaleString()} plays)`;
                        } else if (mode === "track" || mode === "album") {
                             // item.artist is object with name, url
                            secondaryInfo = `by [${item.artist.name}](${item.artist.url}) (${parseInt(item.playcount).toLocaleString()} plays)`;
                        }

                        return `${globalIndex}. [${itemName}](${item.url}) ${secondaryInfo}`;
                    }).join("\n")
                )
                .setFooter({ text: `Page ${page}/${totalPages} • Last.fm • ${username}` })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('first').setLabel('<<').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                    new ButtonBuilder().setCustomId('prev').setLabel('<').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                    new ButtonBuilder().setCustomId('next').setLabel('>').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages),
                     new ButtonBuilder().setCustomId('last').setLabel('>>').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
                );

             return { embed, buttons: [row], totalPages };
        };

        try {
            const { embed, buttons, totalPages } = await getEmbedAndButtons(currentPage);
            
            let msg;
            if (isSlash) {
                msg = await interactionOrMessage.editReply({ content: "", embeds: [embed], components: buttons });
            } else {
                msg = await response.edit({ content: "", embeds: [embed], components: buttons });
            }

            if (buttons.length === 0) return;

             const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

            collector.on('collect', async i => {
                if (i.user.id !== user.id) {
                    return i.reply({ content: "These buttons are not for you!", ephemeral: true });
                }

                await i.deferUpdate();

                if (i.customId === 'prev') {
                    if (currentPage > 1) currentPage--;
                } else if (i.customId === 'next') {
                    if (currentPage < totalPages) currentPage++;
                } else if (i.customId === 'first') {
                    currentPage = 1;
                } else if (i.customId === 'last') {
                    currentPage = totalPages;
                }

                const data = await getEmbedAndButtons(currentPage);
                await i.editReply({ embeds: [data.embed], components: data.buttons });
            });

            collector.on('end', () => {
                if (isSlash) interactionOrMessage.editReply({ components: [] }).catch(() => {});
                else msg.edit({ components: [] }).catch(() => {});
            });

        } catch (err) {
            console.error("Error in topfm command:", err);
            const errorEmbed = new EmbedBuilder()
                .setColor("#ff3300")
                .setTitle(`${MUSIC_EMOJI()} Error`)
                .setDescription("An error occurred while fetching data from Last.fm.")
                .setTimestamp();
            return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [errorEmbed], components: [] }) : response.edit({ content: "", embeds: [errorEmbed], components: [] });
        }
    }
};

const commandData = {
    name: "topfm",
    aliases: ["tfm", "top"],
    data: new SlashCommandBuilder()
        .setName("topfm")
        .setDescription("Shows your top artists, tracks, or albums from Last.fm")
        .addSubcommand(sub => 
            sub.setName("artist")
               .setDescription("Top artists")
               .addStringOption(o => o.setName("period").setDescription("Time period").addChoices(
                   { name: "Weekly", value: "weekly" }, { name: "Monthly", value: "monthly" }, { name: "Quarterly", value: "quarterly" }, { name: "Half Year", value: "half" }, { name: "Yearly", value: "yearly" }, { name: "Overall", value: "overall" }
               ))
               .addStringOption(o => o.setName("query").setDescription("Check rank of specific artist").setAutocomplete(true))
               .addUserOption(o => o.setName("user").setDescription("User to check"))
        )
        .addSubcommand(sub => 
            sub.setName("album")
               .setDescription("Top albums")
               .addStringOption(o => o.setName("period").setDescription("Time period").addChoices(
                   { name: "Weekly", value: "weekly" }, { name: "Monthly", value: "monthly" }, { name: "Quarterly", value: "quarterly" }, { name: "Half Year", value: "half" }, { name: "Yearly", value: "yearly" }, { name: "Overall", value: "overall" }
               ))
               .addStringOption(o => o.setName("query").setDescription("Check rank of specific album").setAutocomplete(true))
               .addUserOption(o => o.setName("user").setDescription("User to check"))
        )
        .addSubcommand(sub => 
            sub.setName("track")
               .setDescription("Top tracks")
               .addStringOption(o => o.setName("period").setDescription("Time period").addChoices(
                   { name: "Weekly", value: "weekly" }, { name: "Monthly", value: "monthly" }, { name: "Quarterly", value: "quarterly" }, { name: "Half Year", value: "half" }, { name: "Yearly", value: "yearly" }, { name: "Overall", value: "overall" }
               ))
               .addStringOption(o => o.setName("query").setDescription("Check rank of specific track").setAutocomplete(true))
               .addUserOption(o => o.setName("user").setDescription("User to check"))
        ),
    
    async autocomplete(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const focusedValue = interaction.options.getFocused();
        const suggestions = await topFMLogic.fetchAutocomplete(subcommand, focusedValue);
        await interaction.respond(suggestions);
    },

    async executeSlash(interaction) {
        const mode = interaction.options.getSubcommand();
        const period = interaction.options.getString("period") || "weekly";
        const query = interaction.options.getString("query");
        const targetUser = interaction.options.getUser("user") || interaction.user;
        await topFMLogic.execute(interaction, true, targetUser, mode, period, query);
    },

    async executePrefix(message, args) {
        // Usage: \topfm [mode] [period] [query...]
        const modeMap = {
            "artist": "artist",
            "track": "track",
            "album": "album"
        };
        const possiblePeriods = ["weekly", "monthly", "quarterly", "half", "yearly", "overall"];

        let mode = "artist"; 
        let period = "weekly";
        let targetUser = message.mentions.users.first() || message.author;
        let query = null;

        // Args parsing is complex with optional args
        // \topfm artist weekly Kanye West
        // \topfm artist Kanye West
        // \topfm Kanye West (Implicit artist?) -> usually topfm defaults to list.
        
        // Let's stick to standard explicit parsing or basic defaults
        if (args[0] && modeMap[args[0].toLowerCase()]) {
            mode = modeMap[args[0].toLowerCase()];
            args.shift();
        }

        if (args[0] && possiblePeriods.includes(args[0].toLowerCase())) {
            period = args[0].toLowerCase();
            args.shift();
        }

        // Remaining args are query
        if (args.length > 0) {
            // Filter mentions
            const mentionRegex = /<@!?\d+>/g;
            const queryParts = args.filter(a => !mentionRegex.test(a)); 
            if (queryParts.length > 0) query = queryParts.join(" ");
        }

        await topFMLogic.execute(message, false, targetUser, mode, period, query);
    }
};

module.exports = commandData;
    
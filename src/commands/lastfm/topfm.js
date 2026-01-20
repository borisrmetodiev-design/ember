const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const path = require("path");
const { readJSON } = require("../../utils/database");

// Node-fetch v3 ESM-compatible import for CommonJS
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

const { signParams } = require("../../utils/lastfmHelper");

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");
const MUSIC_EMOJI = () => process.env.lumenMUSIC || "🎵";

async function loadDB() {
    const data = await readJSON(dataPath);
    return data.users ? data : { users: {} };
}

const topFMLogic = {
    async getLastFMCredentials(discordId) {
        const db = await loadDB();
        const user = db.users[discordId];
        if (!user) return null;
        if (typeof user === 'string') return { username: user, sk: null };
        return { username: user.username, sk: user.sk };
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

    async fetchTopData(creds, mode, period, page = 1) {
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

        const { username, sk } = creds;
        let params = {
            method: method,
            user: username,
            limit: 10,
            page: page,
            period: period,
            format: "json"
        };

        if (sk) {
            params.sk = sk;
            params = signParams(params);
        } else {
            params.api_key = apiKey;
        }

        const queryString = new URLSearchParams(params).toString();
        const url = `https://ws.audioscrobbler.com/2.0/?${queryString}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            if (data.error === 17) throw { code: "022" };
            throw { code: "019", message: data.message };
        }
        
        const items = data[rootProperty]?.[itemProperty] || [];
        // total pages usually in data[rootProperty]['@attr'].totalPages
        const totalPages = data[rootProperty]?.["@attr"]?.totalPages || 1;

        return { items, totalPages: parseInt(totalPages) };
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

    async execute(interactionOrMessage, isSlash, targetUser, mode, periodInput) {
        const loadingEmoji = process.env.lumenLOAD || "⏳";
        const user = targetUser || (isSlash ? interactionOrMessage.user : interactionOrMessage.author);
        
        let response;
        if (isSlash) {
            if (!interactionOrMessage.deferred && !interactionOrMessage.replied) {
                try {
                    await interactionOrMessage.deferReply();
                } catch (err) {
                    if (err.code === 10062) {
                         console.warn("[WARN] Interaction timed out during deferReply in topfm.");
                         return;
                    }
                    console.error("Failed to defer reply for topfm:", err.message);
                    return;
                }
            }
        } else {
            response = await interactionOrMessage.reply({ content: `${loadingEmoji} Fetching your top ${mode}s...` });
        }

        const creds = await this.getLastFMCredentials(user.id);

        if (!creds) {
            const embed = this.buildNoAccountEmbed(user);
            return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [embed] }) : response.edit({ content: "", embeds: [embed] });
        }
        
        const username = creds.username; // For display and no data message

        const period = this.periodMap[periodInput] || "7day";
        const periodLabel = this.periodLabels[period];
        let currentPage = 1;

        // Fetch Function
        const getEmbedAndButtons = async (page) => {
             const { items, totalPages } = await this.fetchTopData(creds, mode, period, page);

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
                        } else if (mode === "track") {
                             // api usually returns artist object with name and url

                            secondaryInfo = `by [${item.artist.name}](${item.artist.url}) (${parseInt(item.playcount).toLocaleString()} plays)`;
                        } else if (mode === "album") {
                            secondaryInfo = `by [${item.artist.name}](${item.artist.url}) (${parseInt(item.playcount).toLocaleString()} plays)`;
                        }

                        return `${globalIndex}. [${itemName}](${item.url}) ${secondaryInfo}`;
                    }).join("\n")
                )
                .setFooter({ text: `Page ${page}/${totalPages} • Last.fm • ${username}` })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('first')
                        .setLabel('\u25C0\u25C0')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 1),
                    new ButtonBuilder()
                        .setCustomId('prev')
                        .setLabel('\u25C0')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 1),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('\u25B6')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page >= totalPages),
                     new ButtonBuilder()
                        .setCustomId('last')
                        .setLabel('\u25B6\u25B6')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page >= totalPages)
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

             const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 }); // 5 minutes

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
                 // Remove buttons when collector times out
                if (isSlash) {
                    interactionOrMessage.editReply({ components: [] }).catch(() => {});
                } else {
                    msg.edit({ components: [] }).catch(() => {});
                }
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
        .addSubcommand(subcommand =>
            subcommand
                .setName("artist")
                .setDescription("Shows your top artists")
                .addStringOption(option =>
                    option.setName("period")
                        .setDescription("Time period (default: weekly)")
                        .setRequired(false)
                        .addChoices(
                            { name: "Weekly", value: "weekly" },
                            { name: "Monthly", value: "monthly" },
                            { name: "Quarterly", value: "quarterly" },
                            { name: "Half Year", value: "half" },
                            { name: "Yearly", value: "yearly" },
                            { name: "Overall", value: "overall" }
                        )
                )
                .addUserOption(option =>
                    option.setName("user").setDescription("The user to check (optional)").setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("track")
                .setDescription("Shows your top tracks")
                .addStringOption(option =>
                    option.setName("period")
                        .setDescription("Time period (default: weekly)")
                        .setRequired(false)
                        .addChoices(
                            { name: "Weekly", value: "weekly" },
                            { name: "Monthly", value: "monthly" },
                            { name: "Quarterly", value: "quarterly" },
                            { name: "Half Year", value: "half" },
                            { name: "Yearly", value: "yearly" },
                            { name: "Overall", value: "overall" }
                        )
                )
                .addUserOption(option =>
                    option.setName("user").setDescription("The user to check (optional)").setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("album")
                .setDescription("Shows your top albums")
                .addStringOption(option =>
                    option.setName("period")
                        .setDescription("Time period (default: weekly)")
                        .setRequired(false)
                        .addChoices(
                            { name: "Weekly", value: "weekly" },
                            { name: "Monthly", value: "monthly" },
                            { name: "Quarterly", value: "quarterly" },
                            { name: "Half Year", value: "half" },
                            { name: "Yearly", value: "yearly" },
                            { name: "Overall", value: "overall" }
                        )
                )
                .addUserOption(option =>
                    option.setName("user").setDescription("The user to check (optional)").setRequired(false)
                )
        ),
        
    async executeSlash(interaction) {
        const mode = interaction.options.getSubcommand();
        const period = interaction.options.getString("period") || "weekly";
        const targetUser = interaction.options.getUser("user") || interaction.user;
        await topFMLogic.execute(interaction, true, targetUser, mode, period);
    },

    async executePrefix(message, args) {
        // Usage: \topfm [mode] [period] [user]
        const modeMap = {
            "artist": "artist", "artists": "artist",
            "track": "track", "tracks": "track",
            "album": "album", "albums": "album"
        };
        const possiblePeriods = ["weekly", "monthly", "quarterly", "half", "yearly", "overall"];

        let mode = "artist"; // Default
        let period = "weekly";
        let targetUser = message.mentions.users.first() || message.author;

        // Check if first arg is a mode
        if (args[0] && modeMap[args[0].toLowerCase()]) {
            mode = modeMap[args[0].toLowerCase()];
            // Shift args so next arg is potentially period
            args.shift();
        }

        // check for period arg

        if (args[0] && possiblePeriods.includes(args[0].toLowerCase())) {
            period = args[0].toLowerCase();
        } 

        await topFMLogic.execute(message, false, targetUser, mode, period);
    }
};

module.exports = commandData;

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
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

    async fetchTopData(username, mode, period) {
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
            case "genre":
                method = "user.gettoptags";
                rootProperty = "toptags";
                itemProperty = "tag";
                break;
            default:
                throw new Error("Invalid mode");
        }

        // Genre (tags) doesn't support periods in Last.fm API
        const url = `https://ws.audioscrobbler.com/2.0/?method=${method}&user=${encodeURIComponent(
            username
        )}&api_key=${apiKey}&format=json&limit=10${mode !== "genre" ? `&period=${period}` : ""}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            throw { code: "019", message: data.message };
        }

        return data[rootProperty]?.[itemProperty] || [];
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
                await interactionOrMessage.deferReply();
            }
        } else {
            response = await interactionOrMessage.reply({ content: `${loadingEmoji} Fetching your top ${mode}s...` });
        }

        const username = await this.getLastFMUsername(user.id);

        if (!username) {
            const embed = this.buildNoAccountEmbed(user);
            return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [embed] }) : response.edit({ content: "", embeds: [embed] });
        }

        const period = this.periodMap[periodInput] || "7day";
        const periodLabel = this.periodLabels[period];

        try {
            const items = await this.fetchTopData(username, mode, period);

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
                return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [noDataEmbed] }) : response.edit({ content: "", embeds: [noDataEmbed] });
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
                        
                        if (mode === "artist") {
                            secondaryInfo = `(${parseInt(item.playcount).toLocaleString()} scrobbles)`;
                        } else if (mode === "track") {
                            secondaryInfo = `by **${item.artist.name}** (${parseInt(item.playcount).toLocaleString()} scrobbles)`;
                        } else if (mode === "album") {
                            secondaryInfo = `by **${item.artist.name}** (${parseInt(item.playcount).toLocaleString()} scrobbles)`;
                        } else if (mode === "genre") {
                            secondaryInfo = `(${parseInt(item.count || item.playcount).toLocaleString()} scrobbles)`;
                        }

                        return `**${index + 1}.** [${itemName}](${item.url}) ${secondaryInfo}`;
                    }).join("\n")
                )
                .setFooter({ text: `Last.fm • ${username}` })
                .setTimestamp();

            return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [embed] }) : response.edit({ content: "", embeds: [embed] });
        } catch (err) {
            console.error("Error in topfm command:", err);
            const errorEmbed = new EmbedBuilder()
                .setColor("#ff3300")
                .setTitle(`${MUSIC_EMOJI()} Error`)
                .setDescription("An error occurred while fetching data from Last.fm.")
                .setTimestamp();
            return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [errorEmbed] }) : response.edit({ content: "", embeds: [errorEmbed] });
        }
    }
};

const commandData = {
    name: "topfm",
    aliases: ["tfm", "top"],
    data: new SlashCommandBuilder()
        .setName("topfm")
        .setDescription("Shows your top artists, tracks, albums, or genres from Last.fm")
        .addStringOption(option =>
            option.setName("mode")
                .setDescription("What to show")
                .setRequired(true)
                .addChoices(
                    { name: "Artist", value: "artist" },
                    { name: "Track", value: "track" },
                    { name: "Album", value: "album" },
                    { name: "Genre", value: "genre" }
                )
        )
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
        ),
        
    async executeSlash(interaction) {
        const mode = interaction.options.getString("mode");
        const period = interaction.options.getString("period") || "weekly";
        const targetUser = interaction.options.getUser("user") || interaction.user;
        await topFMLogic.execute(interaction, true, targetUser, mode, period);
    },

    async executePrefix(message, args) {
        // Usage: \topfm [mode] [period] [user]
        const possibleModes = ["artist", "track", "album", "genre"];
        const possiblePeriods = ["weekly", "monthly", "quarterly", "half", "yearly", "overall"];

        let mode = "artist";
        let period = "weekly";
        let targetUser = message.mentions.users.first() || message.author;

        if (args[0] && possibleModes.includes(args[0].toLowerCase())) {
            mode = args[0].toLowerCase();
        }

        if (args[1] && possiblePeriods.includes(args[1].toLowerCase())) {
            period = args[1].toLowerCase();
        } else if (args[1]) {
            const mention = message.mentions.users.first();
            if (mention && args[1].includes(mention.id)) {
                targetUser = mention;
            }
        }

        if (args[2]) {
             const mention = message.mentions.users.first();
             if (mention) targetUser = mention;
        }

        await topFMLogic.execute(message, false, targetUser, mode, period);
    }
};

module.exports = commandData;

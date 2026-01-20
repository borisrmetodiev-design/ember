const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const path = require("path");
const { signParams, API_KEY } = require("../../utils/lastfmHelper");
const { readJSON, writeJSON } = require("../../utils/database");

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");
const MUSIC_EMOJI = () => process.env.lumenMUSIC;
const LOAD_EMOJI = () => process.env.lumenLOAD;

async function loadDB() {
    try {
        const data = await readJSON(dataPath);
        return data.users ? data : { users: {} };
    } catch (err) {
        throw { code: "005", err };
    }
}

async function saveDB(db) {
    try {
        await writeJSON(dataPath, db);
    } catch (err) {
        throw { code: "005", err };
    }
}

// using dynamic import for fetch causes v3 is esm only
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

async function fetchLastFMUserInfo(username) {
    const apiKey = process.env.LASTFM_API_KEY;
    if (!apiKey) throw { code: "006" };

    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${encodeURIComponent(username)}&api_key=${apiKey}&format=json`;
        
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            throw { code: "019" };
        }

        const user = data.user;
        const topArtistUrl = `https://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=${encodeURIComponent(username)}&api_key=${apiKey}&format=json&limit=1&period=overall`;
        const topArtistRes = await fetch(topArtistUrl);
        const topArtistData = await topArtistRes.json();
        const topArtist = topArtistData.topartists?.artist?.[0]?.name || "N/A";

        return {
            username: user.name,
            realname: user.realname || null,
            playcount: parseInt(user.playcount) || 0,
            registered: user.registered?.unixtime ? new Date(user.registered.unixtime * 1000) : null,
            image: user.image?.find(img => img.size === "large")?.["#text"] || null,
            topArtist,
            url: user.url
        };
    } catch (err) {
        if (err.code) throw err;
        throw { code: "005", err };
    }
}

async function buildConfirmationEmbed(mode, username, oldUsername = null) {
    const embed = new EmbedBuilder()
        .setColor("#ff6600")
        .setTimestamp();

    if (mode === "link" || mode === "replace") {
        try {
            const userInfo = await fetchLastFMUserInfo(username);
            const title = mode === "link" ? "Confirm Last.fm Link" : "Confirm Last.fm Replace";
            const desc = mode === "link" 
                ? `Are you sure you want to link this Last.fm account?\n\n**Username:** [${userInfo.username}](${userInfo.url})` 
                : `Are you sure you want to replace your Last.fm account?\n\n**Old:** \`${oldUsername}\`\n**New:** [${userInfo.username}](${userInfo.url})`;

            embed.setTitle(`${MUSIC_EMOJI()} ${title}`)
                .setDescription(desc)
                .addFields(
                    { name: "Total Scrobbles", value: userInfo.playcount.toLocaleString(), inline: true },
                    { name: "Top Artist", value: userInfo.topArtist, inline: true },
                    { name: "Joined", value: userInfo.registered ? `<t:${Math.floor(userInfo.registered.getTime() / 1000)}:D>` : "Unknown", inline: true }
                );

            if (userInfo.image) embed.setThumbnail(userInfo.image);
        } catch (err) {
            embed.setTitle(`${MUSIC_EMOJI()} Confirm Last.fm ${mode === "link" ? "Link" : "Replace"}`)
                .setDescription(`Are you sure you want to ${mode} to \`${username}\`?\n\nCould not fetch profile info.`);
        }
    } else if (mode === "unlink") {
        embed.setTitle(`${MUSIC_EMOJI()} Confirm Last.fm Unlink`)
            .setDescription(`Are you sure you want to unlink your Last.fm account?\n\n**Username:** \`${username}\``);
    }
    return embed;
}

function buildSuccessEmbed(mode, username) {
    const embed = new EmbedBuilder().setColor("#00ff00").setTimestamp();
    if (mode === "link") {
        embed.setTitle(`${MUSIC_EMOJI()} Last.fm Account Linked`)
            .setDescription(`Linked successfully!\n**Username:** \`${username}\`\nYou can now use \`/np\`, \`/fm\`.`);
    } else if (mode === "replace") {
        embed.setTitle(`${MUSIC_EMOJI()} Last.fm Account Replaced`)
            .setDescription(`Replaced successfully!\n**New Username:** \`${username}\``);
    } else if (mode === "unlink") {
        embed.setTitle(`${MUSIC_EMOJI()} Last.fm Account Unlinked`)
            .setDescription(`Unlinked successfully.`);
    } else if (mode === "login") {
        embed.setTitle(`${MUSIC_EMOJI()} Last.fm Logged In`)
             .setDescription(`Successfully logged in as **${username}**!\n\nYour session key has been saved. You can now use all commands, including those requiring private access.`);
    }
    return embed;
}

async function handleConfirmation(interaction, mode, username, userId) {
    const db = await loadDB();
    if (mode === "link" || mode === "replace") {
        db.users[userId] = username; // Store as string (Public)
        await saveDB(db);
    } else if (mode === "unlink") {
        delete db.users[userId];
        await saveDB(db);
    }
    const successEmbed = buildSuccessEmbed(mode, username);
    try {
        if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds: [successEmbed], components: [] });
        else await interaction.update({ embeds: [successEmbed], components: [] });
    } catch (err) {}
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("lastfmsetup")
        .setDescription("Manage your Last.fm account connection")
        .addStringOption(option =>
            option.setName("mode")
                .setDescription("Action to perform")
                .setRequired(true)
                .addChoices(
                    { name: "Link (Public Only)", value: "link" },
                    { name: "Replace", value: "replace" },
                    { name: "Unlink", value: "unlink" }
                )
        )
        .addStringOption(option =>
            option.setName("username")
                .setDescription("Your Last.fm username (Expected for Link/Replace)")
                .setRequired(false)
        ),

    name: "lastfmsetup",
    aliases: ["lfmsetup", "lfm", "lastfm"],

    async executeSlash(interaction) {
        try {
            const mode = interaction.options.getString("mode");
            const username = interaction.options.getString("username");
            const userId = interaction.user.id;
            const db = await loadDB();
            let currentData = db.users[userId];
            // Normalize currentUsername if it's an object
            const currentUsername = (typeof currentData === 'object' && currentData !== null) ? currentData.username : currentData;

            if (mode === "link") {
                if (!username) throw { code: "004" }; 
                if (currentUsername) {
                    return interaction.reply({ 
                        content: `You already have a Last.fm account linked: \`${currentUsername}\`. Use \`replace\` to change it.`, 
                        ephemeral: true 
                    });
                }
            } else if (mode === "replace") {
                if (!username) throw { code: "004" };
                if (!currentUsername) {
                    return interaction.reply({ 
                        content: `You don't have a Last.fm account linked. Use \`link\` instead.`, 
                        ephemeral: true 
                    });
                }
            } else if (mode === "unlink") {
                if (!currentUsername) {
                    return interaction.reply({ 
                        content: `You don't have a linked account to unlink.`, 
                        ephemeral: true 
                    });
                }
            }

            // Defer reply as building the embed involves fetching data from Last.fm which can be slow
            await interaction.deferReply();

            const confirmEmbed = await buildConfirmationEmbed(mode, username || currentUsername, currentUsername);
            const customId = `lastfm_confirm_${Date.now()}`;

            global.lastfmPendingActions = global.lastfmPendingActions || {};
            global.lastfmPendingActions[customId] = {
                mode,
                username: username || currentUsername,
                userId,
                expiresAt: Date.now() + 60000
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(customId).setLabel("Confirm").setStyle(ButtonStyle.Success)
            );

            await interaction.editReply({ embeds: [confirmEmbed], components: [row] });
            setTimeout(() => { delete global.lastfmPendingActions?.[customId]; }, 60000);

        } catch (err) {
            throw err.code ? err : { code: "005", err };
        }
    },

    async executePrefix(message, args) {
         // prefix handling for link unlink
         // cant do auth easily here so tell em use slash
         const mode = args[0]?.toLowerCase();
         // ... rest of prefix logic (can remain largely same, just handling string username)
         const username = args[1];
         const userId = message.author.id;
         
         const db = await loadDB();
         let currentData = db.users[userId];
         const currentUsername = (typeof currentData === 'object' && currentData !== null) ? currentData.username : currentData;
         
         if (!mode || !["link", "replace", "unlink"].includes(mode)) return message.reply("Invalid usage. Use `/lastfmsetup` for best experience.");
         
          // ... (Same validation as before)
         if (mode === "link" && !username) return message.reply("Missing username.");
         
          const confirmEmbed = await buildConfirmationEmbed(mode, username || currentUsername, currentUsername);
            const customId = `lastfm_confirm_${Date.now()}`;

            global.lastfmPendingActions = global.lastfmPendingActions || {};
            global.lastfmPendingActions[customId] = {
                mode,
                username: username || currentUsername,
                userId,
                expiresAt: Date.now() + 60000
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(customId).setLabel("Confirm").setStyle(ButtonStyle.Success)
            );

            await message.reply({ embeds: [confirmEmbed], components: [row] });
            setTimeout(() => { delete global.lastfmPendingActions?.[customId]; }, 60000);
    },

    handleConfirmation 
};
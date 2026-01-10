const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");
const MUSIC_EMOJI = () => process.env.emberMUSIC;
const LOAD_EMOJI = () => process.env.emberLOAD;

function loadDB() {
    try {
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(path.dirname(dataPath), { recursive: true });
            fs.writeFileSync(dataPath, JSON.stringify({ users: {} }, null, 4));
        }
        return JSON.parse(fs.readFileSync(dataPath, "utf8"));
    } catch (err) {
        throw { code: "005", err }; // LastFM data fetch failed (local DB read error)
    }
}

function saveDB(db) {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(db, null, 4));
    } catch (err) {
        throw { code: "005", err }; // LastFM data fetch failed (local DB write error)
    }
}

// Node-fetch v3 ESM-compatible import for CommonJS
const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

// Fetch Last.fm user info for validation and display
async function fetchLastFMUserInfo(username) {
    const apiKey = process.env.LASTFM_API_KEY;
    if (!apiKey) throw { code: "006" }; // LastFM API authentication failed

    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${encodeURIComponent(username)}&api_key=${apiKey}&format=json`;
        
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            throw { code: "019" }; // Invalid LastFM user provided
        }

        const user = data.user;

        // Fetch top artist
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
        throw { code: "005", err }; // LastFM data fetch failed
    }
}

async function buildConfirmationEmbed(mode, username, oldUsername = null) {
    const embed = new EmbedBuilder()
        .setColor("#ff6600")
        .setTimestamp();

    // Fetch user info for link and replace modes
    if (mode === "link" || mode === "replace") {
        try {
            const userInfo = await fetchLastFMUserInfo(username);

            if (mode === "link") {
                embed.setTitle(`${MUSIC_EMOJI()} Confirm Last.fm Link`)
                    .setDescription(
                        `Are you sure you want to link this Last.fm account?\n\n` +
                        `**Username:** [${userInfo.username}](${userInfo.url})`
                    );
            } else {
                embed.setTitle(`${MUSIC_EMOJI()} Confirm Last.fm Replace`)
                    .setDescription(
                        `Are you sure you want to replace your Last.fm account?\n\n` +
                        `**Old Username:** \`${oldUsername}\`\n` +
                        `**New Username:** [${userInfo.username}](${userInfo.url})`
                    );
            }

            // Add profile fields
            embed.addFields(
                {
                    name: "Total Scrobbles",
                    value: userInfo.playcount.toLocaleString(),
                    inline: true
                },
                {
                    name: "Top Artist",
                    value: userInfo.topArtist,
                    inline: true
                },
                {
                    name: "Joined",
                    value: userInfo.registered ? `<t:${Math.floor(userInfo.registered.getTime() / 1000)}:D>` : "Unknown",
                    inline: true
                }
            );

            if (userInfo.image) {
                embed.setThumbnail(userInfo.image);
            }
        } catch (err) {
            // If fetching fails, show basic confirmation
            if (mode === "link") {
                embed.setTitle(`${MUSIC_EMOJI()} Confirm Last.fm Link`)
                    .setDescription(
                        `Are you sure you want to link your Last.fm account?\n\n` +
                        `**Username:** \`${username}\`\n\n` +
                        `Could not fetch profile info. Please verify the username is correct.`
                    );
            } else {
                embed.setTitle(`${MUSIC_EMOJI()} Confirm Last.fm Replace`)
                    .setDescription(
                        `Are you sure you want to replace your Last.fm account?\n\n` +
                        `**Old Username:** \`${oldUsername}\`\n` +
                        `**New Username:** \`${username}\`\n\n` +
                        `Could not fetch profile info. Please verify the username is correct.`
                    );
            }
        }
    } else if (mode === "unlink") {
        embed.setTitle(`${MUSIC_EMOJI()} Confirm Last.fm Unlink`)
            .setDescription(
                `Are you sure you want to unlink your Last.fm account?\n\n` +
                `**Username:** \`${username}\``
            );
    }

    return embed;
}

function buildSuccessEmbed(mode, username) {
    const embed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTimestamp();

    if (mode === "link") {
        embed.setTitle(`${MUSIC_EMOJI()} Last.fm Account Linked`)
            .setDescription(
                `Your Last.fm account has been linked successfully!\n\n` +
                `**Username:** \`${username}\`\n` +
                `You can now use \`/np\`, \`/fm\`, or \`/nowplaying\`.`
            );
    } else if (mode === "replace") {
        embed.setTitle(`${MUSIC_EMOJI()} Last.fm Account Replaced`)
            .setDescription(
                `Your Last.fm account has been replaced successfully!\n\n` +
                `**New Username:** \`${username}\`\n` +
                `You can now use \`/np\`, \`/fm\`, or \`/nowplaying\`.`
            );
    } else if (mode === "unlink") {
        embed.setTitle(`${MUSIC_EMOJI()} Last.fm Account Unlinked`)
            .setDescription(
                `Your Last.fm account has been unlinked successfully.\n\n` +
                `Use \`/lastfmsetup\` to link a new account.`
            );
    }

    return embed;
}

async function handleConfirmation(interaction, mode, username, userId) {
    const db = loadDB();

    if (mode === "link") {
        db.users[userId] = username;
        saveDB(db);
    } else if (mode === "replace") {
        db.users[userId] = username;
        saveDB(db);
    } else if (mode === "unlink") {
        delete db.users[userId];
        saveDB(db);
    }

    const successEmbed = buildSuccessEmbed(mode, username);
    await interaction.update({ embeds: [successEmbed], components: [] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("lastfmsetup")
        .setDescription("Manage your Last.fm account connection")
        .addStringOption(option =>
            option
                .setName("mode")
                .setDescription("Action to perform")
                .setRequired(true)
                .addChoices(
                    { name: "Link Account", value: "link" },
                    { name: "Replace Account", value: "replace" },
                    { name: "Unlink Account", value: "unlink" }
                )
        )
        .addStringOption(option =>
            option
                .setName("username")
                .setDescription("Your Last.fm username (not needed for unlink)")
                .setRequired(false)
        ),

    name: "lastfmsetup",
    aliases: ["lfmsetup", "lfm", "lastfm"],

    async executeSlash(interaction) {
        try {
            const mode = interaction.options.getString("mode");
            const username = interaction.options.getString("username");
            const userId = interaction.user.id;

            const db = loadDB();
            const currentUsername = db.users[userId];

            // Validation based on mode
            if (mode === "link") {
                if (!username) throw { code: "004" }; // Missing required arguments
                if (currentUsername) {
                    const embed = new EmbedBuilder()
                        .setColor("#ff3300")
                        .setTitle(`${MUSIC_EMOJI()} Account Already Linked`)
                        .setDescription(
                            `You already have a Last.fm account linked: \`${currentUsername}\`\n\n` +
                            `Use \`/lastfmsetup mode:replace\` to change it.`
                        )
                        .setFooter({ text: "Ember Status — Last.fm" })
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            } else if (mode === "replace") {
                if (!username) throw { code: "004" }; // Missing required arguments
                if (!currentUsername) {
                    const embed = new EmbedBuilder()
                        .setColor("#ff3300")
                        .setTitle(`${MUSIC_EMOJI()} No Account Linked`)
                        .setDescription(
                            `You don't have a Last.fm account linked yet.\n\n` +
                            `Use \`/lastfmsetup mode:link\` to link one.`
                        )
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            } else if (mode === "unlink") {
                if (!currentUsername) {
                    const embed = new EmbedBuilder()
                        .setColor("#ff3300")
                        .setTitle(`${MUSIC_EMOJI()} No Account Linked`)
                        .setDescription(
                            `You don't have a Last.fm account linked.\n\n` +
                            `Use \`/lastfmsetup mode:link\` to link one.`
                        )
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            }

            // Build confirmation embed and button
            const confirmEmbed = await buildConfirmationEmbed(mode, username || currentUsername, currentUsername);
            const customId = `lastfm_confirm_${Date.now()}`;

            // Store pending action in global cache
            global.lastfmPendingActions = global.lastfmPendingActions || {};
            global.lastfmPendingActions[customId] = {
                mode,
                username: username || currentUsername,
                userId,
                expiresAt: Date.now() + 60000 // 60 seconds
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel("Confirm")
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.reply({ embeds: [confirmEmbed], components: [row] });

            // Auto-cleanup after 60 seconds
            setTimeout(() => {
                delete global.lastfmPendingActions?.[customId];
            }, 60000);
        } catch (err) {
            throw err.code ? err : { code: "005", err };
        }
    },

    async executePrefix(message, args) {
        try {
            const mode = args[0]?.toLowerCase();
            const username = args[1];
            const userId = message.author.id;

            if (!mode || !["link", "replace", "unlink"].includes(mode)) {
                throw { code: "004" }; // Missing required arguments
            }

            const db = loadDB();
            const currentUsername = db.users[userId];

            // Validation based on mode
            if (mode === "link") {
                if (!username) throw { code: "004" };
                if (currentUsername) {
                    const embed = new EmbedBuilder()
                        .setColor("#ff3300")
                        .setTitle(`${MUSIC_EMOJI()} Account Already Linked`)
                        .setDescription(
                            `You already have a Last.fm account linked: \`${currentUsername}\`\n\n` +
                            `Use \`\\\\lastfmsetup replace <username>\` to change it.`
                        )
                        .setTimestamp();
                    return message.reply({ embeds: [embed] });
                }
            } else if (mode === "replace") {
                if (!username) throw { code: "004" };
                if (!currentUsername) {
                    const embed = new EmbedBuilder()
                        .setColor("#ff3300")
                        .setTitle(`${MUSIC_EMOJI()} No Account Linked`)
                        .setDescription(
                            `You don't have a Last.fm account linked yet.\n\n` +
                            `Use \`\\\\lastfmsetup link <username>\` to link one.`
                        )
                        .setTimestamp();
                    return message.reply({ embeds: [embed] });
                }
            } else if (mode === "unlink") {
                if (!currentUsername) {
                    const embed = new EmbedBuilder()
                        .setColor("#ff3300")
                        .setTitle(`${MUSIC_EMOJI()} No Account Linked`)
                        .setDescription(
                            `You don't have a Last.fm account linked.\n\n` +
                            `Use \`\\\\lastfmsetup link <username>\` to link one.`
                        )
                        .setTimestamp();
                    return message.reply({ embeds: [embed] });
                }
            }

            // Build confirmation embed and button
            const confirmEmbed = await buildConfirmationEmbed(mode, username || currentUsername, currentUsername);
            const customId = `lastfm_confirm_${Date.now()}`;

            // Store pending action in global cache
            global.lastfmPendingActions = global.lastfmPendingActions || {};
            global.lastfmPendingActions[customId] = {
                mode,
                username: username || currentUsername,
                userId,
                expiresAt: Date.now() + 60000
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel("Confirm")
                    .setStyle(ButtonStyle.Success)
            );

            await message.reply({ embeds: [confirmEmbed], components: [row] });

            // Auto-cleanup after 60 seconds
            setTimeout(() => {
                delete global.lastfmPendingActions?.[customId];
            }, 60000);
        } catch (err) {
            throw err.code ? err : { code: "005", err };
        }
    },

    // Export handler for button confirmation
    handleConfirmation
};
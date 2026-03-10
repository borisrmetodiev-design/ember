const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const path = require("path");
const { signParams } = require("../../utils/lastfmHelper");
const { readJSON } = require("../../utils/database");

const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");
const MUSIC_EMOJI = () => process.env.lumenMUSIC;

async function loadDB() {
    const data = await readJSON(dataPath);
    return data.users ? data : { users: {} };
}

/**
 * Gets the highest resolution image URL from Last.fm image array.
 * Attempts to use the mega or extralarge size, then falls back.
 * Also applies a trick to get original size by replacing size segments.
 */
function getHighResImage(images) {
    if (!images || images.length === 0) return null;
    
    const mega = images.find(img => img.size === 'mega');
    const extralarge = images.find(img => img.size === 'extralarge');
    const large = images.find(img => img.size === 'large');
    
    let url = mega?.['#text'] || extralarge?.['#text'] || large?.['#text'] || images[0]['#text'];
    
    if (!url || url === "") return null;

    // Last.fm image optimization trick: 
    // URLs like https://lastfm.freetls.fastly.net/i/u/300x300/hash.jpg
    // can be converted to original size by replacing the size (300x300) with ar0 (original aspect) or 0x0.
    // Some suggest just /u/hash.jpg works but ar0 is more reliable.
    return url.replace(/\/u\/\d+x\d+\//, '/u/ar0/');
}

const coverLogic = {
    async getLastFMCredentials(discordId) {
        const db = await loadDB();
        const user = db.users[discordId];
        if (!user) return null;
        if (typeof user === 'string') return { username: user, sk: null };
        return { username: user.username, sk: user.sk };
    },

    async fetchNowPlaying(creds) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) throw { code: "006" };

        const { username, sk } = creds;
        let params = {
            method: "user.getrecenttracks",
            user: username,
            limit: 1,
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

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            const data = await res.json();

            if (data.error) {
                if (data.error === 17) throw { code: "022" };
                throw { code: "005", err: data.message };
            }

            if (!data.recenttracks || !data.recenttracks.track || data.recenttracks.track.length === 0) {
                throw { code: "020" };
            }

            return data.recenttracks.track[0];
        } catch (err) {
            if (err.name === 'AbortError') throw { code: "005", err: "Last.fm request timed out" };
            throw err;
        }
    },

    async fetchAlbumInfo(albumName, artistName) {
        const apiKey = process.env.LASTFM_API_KEY;
        if (!apiKey) throw { code: "006" };

        let url;
        if (artistName) {
            url = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&album=${encodeURIComponent(albumName)}&artist=${encodeURIComponent(artistName)}&api_key=${apiKey}&format=json`;
        } else {
            // If no artist provided, search for the album first to get the best match
            const searchUrl = `https://ws.audioscrobbler.com/2.0/?method=album.search&album=${encodeURIComponent(albumName)}&api_key=${apiKey}&format=json&limit=1`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();
            const topMatch = searchData.results?.albummatches?.album?.[0];
            
            if (!topMatch) throw { code: "005", err: "Album not found." };
            url = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&album=${encodeURIComponent(topMatch.name)}&artist=${encodeURIComponent(topMatch.artist)}&api_key=${apiKey}&format=json`;
        }

        const res = await fetch(url);
        const data = await res.json();

        if (data.error || !data.album) {
            throw { code: "005", err: data.message || "Album not found." };
        }

        return data.album;
    },

    async execute(interactionOrMessage, isSlash, targetUser, albumQuery) {
        const loadingEmoji = process.env.lumenLOAD || "⏳";
        const user = targetUser || (isSlash ? interactionOrMessage.user : interactionOrMessage.author);
        const requestor = isSlash ? interactionOrMessage.user : interactionOrMessage.author;

        let response;
        if (isSlash) {
            if (!interactionOrMessage.deferred && !interactionOrMessage.replied) {
                await interactionOrMessage.deferReply();
            }
        } else {
            response = await interactionOrMessage.reply({ content: `${loadingEmoji} Fetching album cover...` });
        }

        try {
            let artistName, albumName, trackName, trackUrl, albumUrl, artistUrl, highResImage, trackData;

            if (albumQuery) {
                // Handle specific album search
                const separator = " | ";
                const lastIndex = albumQuery.lastIndexOf(separator);
                let queryAlbum = albumQuery;
                let queryArtist = null;

                if (lastIndex !== -1) {
                    queryAlbum = albumQuery.substring(0, lastIndex);
                    queryArtist = albumQuery.substring(lastIndex + separator.length);
                }

                const album = await this.fetchAlbumInfo(queryAlbum, queryArtist);
                artistName = album.artist;
                albumName = album.name;
                trackName = albumName; // For the embed description, we'll just use album name
                
                highResImage = getHighResImage(album.image);
                artistUrl = `https://www.last.fm/music/${encodeURIComponent(artistName)}`;
                albumUrl = album.url || artistUrl;
                trackUrl = albumUrl;
            } else {
                // Default to now playing
                const creds = await this.getLastFMCredentials(user.id);
                if (!creds) {
                    const noAccountEmbed = new EmbedBuilder()
                        .setColor("#ff3300")
                        .setAuthor({
                            name: user.username,
                            iconURL: user.displayAvatarURL({ dynamic: true })
                        })
                        .setTitle(`${MUSIC_EMOJI()} No Last.fm Account Linked`)
                        .setDescription(`There's no LastFM account associated with ${user}.\nPlease run the \`lastfmsetup\` command to connect accounts.`);
                    
                    return isSlash ? interactionOrMessage.editReply({ content: "", embeds: [noAccountEmbed] }) : response.edit({ content: "", embeds: [noAccountEmbed] });
                }

                trackData = await this.fetchNowPlaying(creds);
                artistName = trackData.artist["#text"];
                trackName = trackData.name;
                albumName = trackData.album["#text"] || "Unknown Album";
                highResImage = getHighResImage(trackData.image);

                artistUrl = `https://www.last.fm/music/${encodeURIComponent(artistName)}`;
                trackUrl = trackData.url || artistUrl;
                albumUrl = trackData.album["#text"] ? `https://www.last.fm/music/${encodeURIComponent(artistName)}/${encodeURIComponent(albumName)}` : artistUrl;
            }
            
            if (!highResImage) {
                const noImageMsg = "No cover art found for this on Last.fm.";
                return isSlash ? interactionOrMessage.editReply({ content: noImageMsg }) : response.edit({ content: noImageMsg });
            }

            // Verify the image actually exists and is ready to be served
            try {
                const imgCheck = await fetch(highResImage, { method: 'HEAD', timeout: 5000 });
                if (!imgCheck.ok) {
                    // Note: trackData might be undefined if albumQuery was used, 
                    // but we can try to find images in the album object too.
                    // For simplicity, if HEAD fails we just use the highResImage as is or try to fallback.
                    console.warn("Image pre-fetch HEAD returned non-OK status");
                }
            } catch (e) {
                console.warn("Image pre-fetch check failed, proceeding with original URL");
            }

            const imageEmbed = new EmbedBuilder()
                .setColor("#ff6600")
                .setImage(highResImage);

            const detailsText = albumQuery 
                ? `[**${albumName}**](${albumUrl}) by [**${artistName}**](${artistUrl})`
                : `[**${trackName}**](${trackUrl}) by [**${artistName}**](${artistUrl}) on [**${albumName}**](${albumUrl})`;

            const detailsEmbed = new EmbedBuilder()
                .setColor("#ff6600")
                .setDescription(detailsText)
                .setFooter({ 
                    text: `Requested by ${requestor.username}`, 
                    iconURL: requestor.displayAvatarURL({ dynamic: true }) 
                });

            if (isSlash) {
                await interactionOrMessage.editReply({ content: "", embeds: [imageEmbed, detailsEmbed] });
            } else {
                await response.edit({ content: "", embeds: [imageEmbed, detailsEmbed] });
            }

        } catch (err) {
            console.error("Cover command error:", err);
            const errorCode = err.code || "005";
            const errorReason = err.err || err.message || "Unknown error";
            
            // Re-use bot's error structure if possible, but for now simple message
            const errorEmbed = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("Error")
                .setDescription(`Failed to fetch cover: ${errorReason} (Code: ${errorCode})`);

            if (isSlash) {
                await interactionOrMessage.editReply({ content: "", embeds: [errorEmbed] });
            } else if (response) {
                await response.edit({ content: "", embeds: [errorEmbed] });
            } else {
                await interactionOrMessage.reply({ embeds: [errorEmbed] });
            }
        }
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("cover")
        .setDescription("Shows the cover art of the song you're listening to or the one you specify")
        .addUserOption(option =>
            option.setName("user").setDescription("The user to check (optional)").setRequired(false)
        )
        .addStringOption(option =>
            option.setName("album").setDescription("The album to show the cover of").setRequired(false).setAutocomplete(true)
        ),
    name: "cover",
    aliases: ["c"],

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const apiKey = process.env.LASTFM_API_KEY;

        if (!focusedValue) return interaction.respond([]);

        try {
            const url = `https://ws.audioscrobbler.com/2.0/?method=album.search&album=${encodeURIComponent(focusedValue)}&api_key=${apiKey}&format=json&limit=5`;
            const res = await fetch(url);
            const data = await res.json();

            const results = data.results?.albummatches?.album?.map(a => ({ 
                name: `${a.name} by ${a.artist}`, 
                value: `${a.name} | ${a.artist}` 
            })) || [];

            await interaction.respond(results.slice(0, 25));
        } catch (err) {
            await interaction.respond([]);
        }
    },

    async executeSlash(interaction) {
        const targetUser = interaction.options.getUser("user") || interaction.user;
        const albumQuery = interaction.options.getString("album");
        await coverLogic.execute(interaction, true, targetUser, albumQuery);
    },
    async executePrefix(message, args) {
        let targetUser = message.mentions.users.first();
        let albumQuery = "";

        if (targetUser) {
            albumQuery = args.slice(1).join(" ");
        } else {
            targetUser = message.author;
            albumQuery = args.join(" ");
        }

        await coverLogic.execute(message, false, targetUser, albumQuery);
    }
};

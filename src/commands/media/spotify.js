const {
    SlashCommandBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require("discord.js");

const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { default: fetch } = require("node-fetch");
const spotifyUrlInfo = require("spotify-url-info");
const ytdlp = require("yt-dlp-exec");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

const { getData: getSpotifyData } = spotifyUrlInfo(fetch);

// Cache for Details button metadata
const detailsCache = new Map();

// Convert ms → mm:ss
function msToTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Clean YouTube titles aggressively (Artist - Track)
function cleanYouTubeTitle(title) {
    if (!title) return "Unknown Track";

    title = title.replace(/\(.*?\)|\[.*?\]/g, "").trim();
    title = title.replace(/\s+/g, " ").trim();

    if (title.includes("-")) {
        const [artist, track] = title.split("-").map(s => s.trim());
        if (artist && track) return `${artist} - ${track}`;
    }

    return title;
}

// Search using play-dl (metadata only) - much more stable than yt-dlp for search
async function ytDlpSearch(query) {
    try {
        const play = require("play-dl");
        // Only search for videos
        const results = await play.search(query, { limit: 10, source: { youtube: 'video' } });
        
        return results.map(v => ({
            title: v.title,
            channel: v.channel?.name || "Unknown",
            duration: v.durationInSec || 0,
            view_count: v.views || 0,
            webpage_url: v.url,
            url: v.url,
            thumbnail: v.thumbnails?.[0]?.url || null,
            uploader: v.channel?.name || "Unknown",
            upload_date: v.uploadedAt || null
        }));
    } catch (err) {
        console.error("[PLAY-DL SEARCH ERROR]", err);
        // Fallback to yt-search (already in package.json)
        try {
            const ytSearch = require("yt-search");
            const res = await ytSearch(query);
            return (res.videos || []).slice(0, 10).map(v => ({
                title: v.title,
                channel: v.author?.name || "Unknown",
                duration: v.seconds || 0,
                view_count: v.views || 0,
                webpage_url: v.url,
                url: v.url,
                thumbnail: v.thumbnail || null,
                uploader: v.author?.name || "Unknown"
            }));
        } catch (sErr) {
            console.error("[YT-SEARCH ERROR]", sErr);
            return [];
        }
    }
}

// Smart Mode: pick best YouTube match for Spotify metadata
async function findBestYouTubeMatchFromSpotify(spData) {
    const trackName = spData.name;
    const artists = spData.artists.map(a => a.name);
    const query = `${trackName} ${artists.join(" ")}`.trim();
    const spotifyDurationMs = spData.duration_ms || 0;

    const results = await ytDlpSearch(query);
    if (!results.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const r of results) {
        const durationMs = (r.duration || 0) * 1000;
        const durationDiff = Math.abs(durationMs - spotifyDurationMs);

        const title = (r.title || "").toLowerCase();
        const channel = (r.channel || "").toLowerCase();

        let score = 0;

        // Score based on duration proximity instead of strict skipping
        if (durationDiff <= 3000) score += 50;
        else if (durationDiff <= 7000) score += 30;
        else if (durationDiff <= 15000) score += 10;
        else if (durationDiff > 30000) score -= 40; // Penalize heavy mismatches (e.g. 10h loops or clips)


        const isTopic = channel.endsWith(" - topic");
        const isLyric = title.includes("lyric");
        const isAudio = title.includes("audio");
        const isOfficial = title.includes("official");
        const isMusicVideo = title.includes("music video") || title.includes("mv");

        if (isTopic) score += 100;
        if (isLyric) score += 40;
        if (isAudio) score += 30;
        if (isOfficial) score += 20;
        if (isMusicVideo) score -= 10;

        if (title.includes(trackName.toLowerCase())) score += 25;
        if (title.includes(artists.join(" ").toLowerCase())) score += 20;

        if (r.channel_follower_count) score += 10;

        score += Math.min(Math.log10((r.view_count || 1) + 1) * 3, 30);

        if (score > bestScore) {
            bestScore = score;
            best = r;
        }
    }

    return best;
}

// Smart Mode for text queries
async function findBestYouTubeMatchFromQuery(query) {
    const results = await ytDlpSearch(query);
    if (!results.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const r of results) {
        const title = (r.title || "").toLowerCase();
        const channel = (r.channel || "").toLowerCase();

        let score = 0;

        const isTopic = channel.endsWith(" - topic");
        const isLyric = title.includes("lyric");
        const isAudio = title.includes("audio");
        const isOfficial = title.includes("official");
        const isMusicVideo = title.includes("music video") || title.includes("mv");

        if (isTopic) score += 100;
        if (isLyric) score += 40;
        if (isAudio) score += 30;
        if (isOfficial) score += 20;
        if (isMusicVideo) score -= 10;

        if (r.channel_follower_count) score += 10;

        score += Math.min(Math.log10((r.view_count || 1) + 1) * 3, 30);

        if (score > bestScore) {
            bestScore = score;
            best = r;
        }
    }

    return best;
}

// Autocomplete for slash command
async function autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    if (!focused) return interaction.respond([]).catch(() => {});

    try {
        const videos = await ytDlpSearch(focused);
        const choices = videos.map(v => ({
            name: v.title.length > 100 ? v.title.slice(0, 97) + "..." : v.title,
            value: v.webpage_url || v.url
        }));

        if (!interaction.responded) {
            await interaction.respond(choices);
        }
    } catch {
        if (!interaction.responded) {
            await interaction.respond([]).catch(() => {});
        }
    }
}
module.exports = {
    data: new SlashCommandBuilder()
        .setName("spotify")
        .setDescription("Download a song from Spotify, YouTube, or a query as MP3")
        .addStringOption(option =>
            option.setName("query")
                .setDescription("Song name, Spotify URL, or YouTube URL")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    name: "spotify",
    aliases: ["sp"],

    async autocomplete(interaction) {
        return autocomplete(interaction);
    },

    async executeSlash(interaction) {
        const query = interaction.options.getString("query");
        await this.handleSpotify(interaction, query, true);
    },

    async executePrefix(message, args) {
        const query = args.join(" ");
        if (!query) return message.reply("❌ Please provide a song name or URL.");
        await this.handleSpotify(message, query, false);
    },
        async handleSpotify(context, query, isSlash) {
        const loading = process.env.lumenLOAD || "⏳";

        let msg;
        try {
            if (isSlash) {
                await context.deferReply();
                msg = await context.fetchReply();
            } else {
                msg = await context.reply(`${loading} Searching...`);
            }
        } catch {
            return;
        }

        const update = (content) =>
            isSlash ? context.editReply(content) : msg.edit(content);

        const tempId = Date.now().toString();
        let tempRawPath;
        let tempMp3Path;

        try {
            let videoUrl = null;
            let spotifyMeta = null;
            let youtubeMeta = null;

            const isSpotify = query.includes("open.spotify.com");
            const isYouTube = query.includes("youtube.com") || query.includes("youtu.be");

            // Spotify URL → Smart Mode
            if (isSpotify) {
                spotifyMeta = await getSpotifyData(query).catch(() => null);
                if (!spotifyMeta || spotifyMeta.type !== "track") {
                    throw new Error("Invalid or unsupported Spotify track URL.");
                }

                const best = await findBestYouTubeMatchFromSpotify(spotifyMeta);
                if (!best) throw new Error("Couldn't find a matching YouTube version.");

                videoUrl = best.webpage_url || best.url;
                youtubeMeta = best;
            }

            // YouTube URL → use exact URL (Option B)
            else if (isYouTube) {
                videoUrl = query;
            }

            // Text query → Smart Mode
            else {
                const best = await findBestYouTubeMatchFromQuery(query);
                if (!best) throw new Error("No results found.");
                videoUrl = best.webpage_url || best.url;
                youtubeMeta = best;
            }

            await update(`${loading} Downloading...`);

            const tempRawName = `raw_${tempId}.webm`;
            const tempMp3Name = `song_${tempId}.mp3`;

            tempRawPath = path.join(os.tmpdir(), tempRawName);
            tempMp3Path = path.join(os.tmpdir(), tempMp3Name);

            // yt-dlp download: use bestaudio to avoid SABR/403
            // We use the webpage_url to ensure compatibility
            await ytdlp(videoUrl, {
                format: "bestaudio",
                output: tempRawPath,
                noCheckCertificates: true,
                preferFreeFormats: true,
                addHeader: ['referer:youtube.com', 'user-agent:googlebot']
            });

            // Determine filename
            let finalName = "song.mp3";

            if (spotifyMeta) {
                const artist = spotifyMeta.artists?.[0]?.name || "Unknown Artist";
                const track = spotifyMeta.name || "Unknown Track";
                finalName = `${artist} - ${track}.mp3`.replace(/[\\/:*?"<>|]/g, "");
            } else if (youtubeMeta) {
                const cleaned = cleanYouTubeTitle(youtubeMeta.title);
                finalName = `${cleaned}.mp3`.replace(/[\\/:*?"<>|]/g, "");
            }

            // ffmpeg conversion + metadata
            await new Promise((resolve, reject) => {
                const cmd = ffmpeg(tempRawPath)
                    .setFfmpegPath(ffmpegPath)
                    .audioBitrate(128) // 128kbps is safer for Discord's 8MB limit
                    .toFormat("mp3")
                    .on("end", resolve)
                    .on("error", reject);

                if (spotifyMeta) {
                    const artist = spotifyMeta.artists?.[0]?.name || "";
                    const album = spotifyMeta.album?.name || "";
                    const title = spotifyMeta.name || "";

                    cmd.outputOptions([
                        `-metadata title=${title}`,
                        `-metadata artist=${artist}`,
                        `-metadata album=${album}`
                    ]);

                    const coverUrl = spotifyMeta.album?.images?.[0]?.url;
                    if (coverUrl) {
                        const coverPath = path.join(os.tmpdir(), `cover_${tempId}.jpg`);
                        fetch(coverUrl)
                            .then(r => r.buffer())
                            .then(buf => fs.writeFileSync(coverPath, buf))
                            .then(() => {
                                cmd.input(coverPath);
                                cmd.outputOptions([
                                    "-map 0:a",
                                    "-map 1:v",
                                    "-id3v2_version 3",
                                    "-metadata:s:v title=Album cover",
                                    "-metadata:s:v comment=Cover (front)"
                                ]);
                            })
                            .finally(() => cmd.save(tempMp3Path));
                        return;
                    }
                }

                cmd.save(tempMp3Path);
            });

            if (!fs.existsSync(tempMp3Path)) {
                throw new Error("Conversion failed.");
            }

            // Check file size (Discord limit is usually 8MB for non-boosted)
            const stats = fs.statSync(tempMp3Path);
            const fileSizeMB = stats.size / (1024 * 1024);
            if (fileSizeMB > 24) { // Absolute max for any boost level usually, or custom limit
                 throw new Error(`File is too large (${fileSizeMB.toFixed(1)}MB). Limit is 25MB.`);
            }

            const attachment = new AttachmentBuilder(tempMp3Path, {
                name: finalName
            });

            // Prepare Details button
            let row = null;
            if (spotifyMeta || youtubeMeta) {
                const id = `spotify_details_${tempId}`;
                const meta = spotifyMeta || youtubeMeta;

                detailsCache.set(id, {
                    trackName: spotifyMeta ? spotifyMeta.name : (youtubeMeta.title || "Unknown"),
                    artists: spotifyMeta 
                        ? spotifyMeta.artists.map(a => ({ name: a.name, url: a.external_urls?.spotify || null }))
                        : [{ name: youtubeMeta.uploader || youtubeMeta.channel || "Unknown", url: null }],
                    albumName: spotifyMeta?.album?.name || null,
                    albumUrl: spotifyMeta?.album?.external_urls?.spotify || null,
                    coverUrl: spotifyMeta?.album?.images?.[0]?.url || youtubeMeta.thumbnail || null,
                    trackUrl: spotifyMeta?.external_urls?.spotify || videoUrl,
                    releaseDate: spotifyMeta?.album?.release_date || youtubeMeta.upload_date || null,
                    durationMs: spotifyMeta?.duration_ms || (youtubeMeta.duration ? youtubeMeta.duration * 1000 : null),
                    popularity: spotifyMeta?.popularity ?? null,
                    ytUrl: videoUrl
                });

                row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(id)
                        .setLabel("Details")
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            const payload = {
                content: "",
                files: [attachment]
            };

            if (row) payload.components = [row];

            await update(payload);

            // Cleanup
            setTimeout(() => {
                if (fs.existsSync(tempRawPath)) fs.unlink(tempRawPath, () => {});
                if (fs.existsSync(tempMp3Path)) fs.unlink(tempMp3Path, () => {});
            }, 5000);

        } catch (err) {
            console.error("[SPOTIFY COMMAND ERROR]", err);
            await update(`❌ ${err.message || "Download failed."}`);

            if (tempRawPath && fs.existsSync(tempRawPath)) fs.unlink(tempRawPath, () => {});
            if (tempMp3Path && fs.existsSync(tempMp3Path)) fs.unlink(tempMp3Path, () => {});
        }
    },
        async handleButton(interaction) {
        const id = interaction.customId;
        if (!id.startsWith("spotify_details_")) return;

        const data = detailsCache.get(id);
        if (!data) {
            return interaction.reply({
                content: "❌ Details for this track are no longer available.",
                ephemeral: true
            });
        }

        const {
            trackName,
            artists,
            albumName,
            albumUrl,
            coverUrl,
            trackUrl,
            releaseDate,
            durationMs,
            popularity,
            ytUrl
        } = data;

        const artistText = artists.length
            ? artists.map(a => a.url ? `[${a.name}](${a.url})` : a.name).join(", ")
            : "Unknown Artist";

        const albumText = albumUrl
            ? `[${albumName}](${albumUrl})`
            : albumName || "Unknown Album";

        const lines = [];

        lines.push(`**Album:** ${albumText}`);
        lines.push(`**Artist(s):** ${artistText}`);
        lines.push(`**Released:** ${releaseDate || "Unknown"}`);
        lines.push(`**Duration:** ${msToTime(durationMs || 0)}`);

        if (typeof popularity === "number") {
            lines.push(`**Popularity:** ${popularity}/100`);
        }

        if (trackUrl) {
            lines.push(`**Spotify:** [Open in Spotify](${trackUrl})`);
        }

        if (ytUrl) {
            lines.push(`**YouTube Source:** [Open on YouTube](${ytUrl})`);
        }

        const embed = new EmbedBuilder()
            .setTitle(`${trackName} — ${artists[0]?.name || "Unknown Artist"}`)
            .setDescription(lines.join("\n"))
            .setColor(0x1DB954);

        if (coverUrl) embed.setThumbnail(coverUrl);

        await interaction.reply({
            embeds: [embed],
            ephemeral: false
        });
    }
};

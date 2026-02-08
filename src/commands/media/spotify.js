const {
    SlashCommandBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const { exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
// const ytdlp = require("yt-dlp-exec");
const ffmpegInfo = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { search: ytSearch } = require("yt-search");
const { 
    getTrackData
} = require("../../services/spotify");
const { readJSON } = require("../../utils/database");

const lastFMusersPath = path.join(__dirname, "../../storage/data/lastFMusers.json");

function safeMeta(str) {
    if (!str) return "";
    return String(str)
        .replace(/[\\/:*?"<>|]/g, "")  // Windows-illegal
        .replace(/\s+/g, " ")
        .trim();
}

async function fetchLastFMTrackInfo(artist, track) {
    const apiKey = process.env.LASTFM_API_KEY;
    if (!apiKey) return null;

    try {
        const params = new URLSearchParams({
            method: "track.getInfo",
            artist,
            track,
            api_key: apiKey,
            format: "json"
        });

        const url = `https://ws.audioscrobbler.com/2.0/?${params.toString()}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data?.track) return null;
        return data.track;
    } catch (err) {
        console.error("Last.fm track.getInfo error:", err);
        return null;
    }
}


// helper function to validate Spotify URL
async function isValidSpotifyUrl(url) {
    try {
        const spotifyUrl = new URL(url);
        if (spotifyUrl.hostname === 'spotify.link') return true;
        return (
            (spotifyUrl.hostname === 'open.spotify.com' || spotifyUrl.hostname === 'spotify.com') && 
            spotifyUrl.pathname.startsWith('/track/')
        );
    } catch (error) {
        return false;
    }
}

function spotifySearchTrack(artist, title) {
    const q = encodeURIComponent(`${artist} ${title}`);
    return `https://open.spotify.com/search/${q}`;
}

function spotifySearchArtist(artist) {
    const q = encodeURIComponent(artist);
    return `https://open.spotify.com/search/${q}`;
}

function spotifySearchAlbum(artist, album) {
    const q = encodeURIComponent(`${artist} ${album}`);
    return `https://open.spotify.com/search/${q}`;
}


// Helper function to extract Spotify ID and type from URL, handling redirects
async function getSpotifyInfo(url) {
    try {
        let targetUrl = url;
        if (url.includes('spotify.link')) {
            const res = await fetch(url, { redirect: 'follow', method: 'HEAD' });
            targetUrl = res.url;
        }

        const spotifyUrl = new URL(targetUrl);
        const pathParts = spotifyUrl.pathname.split('/');
        const type = pathParts[1];
        const id = pathParts[2].split('?')[0];
        return { type, id };
    } catch (error) {
        return null;
    }
}

// Clean YouTube titles
function clean(str) {
    if (!str) return "";
    return str
        .replace(/\(.*?\)|\[.*?\]/g, "")
        .replace(/official (video|audio|music video|lyric video|visualizer)/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

// Smart parsing of YouTube results
function parseYTResult(video) {
    const rawTitle = video.title;
    const author = video.author?.name || "";
    
    let artist = author;
    let title = rawTitle;

    if (rawTitle.includes(" - ")) {
        const parts = rawTitle.split(" - ");
        const p1 = parts[0].trim();
        const p2 = parts[1].trim();

        const authorLower = author.toLowerCase().replace(/ topic$/i, "").trim();
        if (p1.toLowerCase().includes(authorLower) || authorLower.includes(p1.toLowerCase())) {
            artist = p1;
            title = p2;
        } else if (p2.toLowerCase().includes(authorLower) || authorLower.includes(p2.toLowerCase())) {
            artist = p2;
            title = p1;
        } else {
            artist = p1;
            title = p2;
        }
    }

    return {
        artist: clean(artist),
        title: clean(title)
    };
}

// helper function to get best image from Last.fm
function getLfmImage(lfmTrack) {
    if (!lfmTrack) return null;
    const images = lfmTrack.album?.image || lfmTrack.image;
    if (!images || !Array.isArray(images) || images.length === 0) return null;
    return images[images.length - 1]['#text'] || null;
}



// Convert ms → mm:ss
function msToTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Last.fm Helpers
async function getLastFMCredentials(discordId) {
    const db = await readJSON(lastFMusersPath);
    const user = db.users?.[discordId];
    if (!user) return null;
    if (typeof user === 'string') return { username: user, sk: null };
    return { username: user.username, sk: user.sk };
}

async function fetchNowPlaying(creds) {
    const apiKey = process.env.LASTFM_API_KEY;
    if (!apiKey) return null;

    try {
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

        const res = await fetch(url);
        const data = await res.json();

        if (data.error || !data.recenttracks?.track?.[0]) return null;

        const track = data.recenttracks.track[0];
        return {
            track,
            isNowPlaying: track["@attr"]?.nowplaying === "true"
        };
    } catch (err) {
        console.error("Error fetching Last.fm now playing:", err);
        return null;
    }
}

// Search logic using yt-search (very stable)
async function fetchYouTubeMatch(queryOrUrl) {
    try {
        const isUrl = queryOrUrl.includes("youtube.com") || queryOrUrl.includes("youtu.be");
        
        if (isUrl) {
            // If it's a URL, we'll still search for its basic info
            const results = await ytSearch(queryOrUrl);
            const video = results.videos[0];
            if (!video) return null;
            return {
                url: video.url,
                title: video.title,
                thumbnail: video.thumbnail,
                seconds: video.seconds,
                views: video.views,
                author: { name: video.author.name }
            };
        } else {
            const results = await ytSearch(queryOrUrl);
            const video = results.videos[0];
            if (!video) return null;
            
            return {
                url: video.url,
                title: video.title,
                thumbnail: video.thumbnail,
                seconds: video.seconds,
                views: video.views,
                author: { name: video.author.name }
            };
        }
    } catch (error) {
        console.error("[YT-SEARCH ERROR]", error);
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("spotify")
        .setDescription("Download a song from Spotify link or what you're listening to")
        .addStringOption(option =>
            option.setName("query")
                .setDescription("Spotify track URL or search query (leave empty for now playing)")
                .setRequired(false)
        ),

    async executeSlash(interaction) {
        const query = interaction.options.getString("query");
        await this.handleSpotify(interaction, query, true);
    },

    async executePrefix(message, args) {
        const query = args.join(" ");
        await this.handleSpotify(message, query, false);
    },

    async handleSpotify(context, query, isSlash) {
        const loading = process.env.lumenLOAD || "⏳";
        let statusMessage = null;

        try {
            if (isSlash) {
                await context.deferReply();
            } else {
                statusMessage = await context.reply(`${loading} Downloading...`);
            }
        } catch (e) {
            console.error("Link error:", e);
            return;
        }

        const updateStatus = async (content) => {
            try {
                if (isSlash) {
                    return await context.editReply(content);
                } else if (statusMessage) {
                    return await statusMessage.edit(content);
                }
            } catch (err) {
                console.error("Update status error:", err);
            }
        };

        try {
            // 1. Resolve Query
            if (!query || query.trim() === "") {
                const userId = isSlash ? context.user.id : context.author.id;
                const creds = await getLastFMCredentials(userId);
                if (!creds) throw new Error("Please provide a Spotify link or link your Last.fm account.");

                const np = await fetchNowPlaying(creds);
                if (!np || !np.track) throw new Error("Could not find what you are currently listening to.");

                query = `${np.track.name} ${np.track.artist["#text"]}`;
            }

            const isSpotify = await isValidSpotifyUrl(query);
            let metadata = null;

            if (isSpotify) {
                const info = await getSpotifyInfo(query);
                if (!info || info.type !== "track") throw new Error("Only Spotify **track** links are supported.");

                const spData = await getTrackData(info.id);
                if (!spData) throw new Error("Could not fetch track data from Spotify.");

                const ytMatch = await fetchYouTubeMatch(`${spData.name} ${spData.artists[0].name} official audio`);
                if (!ytMatch) throw new Error("No YouTube match found.");

                // Fetch Last.fm info for stats and album metadata
                const lfm = await fetchLastFMTrackInfo(spData.artists[0].name, spData.name);

                metadata = {
                    title: lfm?.name || spData.name,
                    artist: spData.artists.map(a => a.name).join(", "),
                    displayArtist: lfm?.artist?.name || spData.artists[0].name,
                    album: lfm?.album?.title || spData.album?.name || "Single",
                    albumUrl: lfm?.album?.url || spData.album?.external_urls?.spotify,
                    cover: getLfmImage(lfm) || spData.album?.images?.[0]?.url,
                    url: spData.external_urls?.spotify,
                    lfmUrl: lfm?.url || null, // Add Last.fm track URL
                    ytUrl: ytMatch.url,
                    durationMs: spData.duration_ms,
                    popularity: spData.popularity,
                    isSpotify: true,
                    fullArtists: spData.artists.map(a => ({ name: a.name, url: a.external_urls?.spotify })),
                    listeners: lfm?.listeners || null,
                    playcount: lfm?.playcount || null
                };
            } else {
                const ytMatch = await fetchYouTubeMatch(query.includes("youtube") || query.includes("youtu.be") ? query : query + " official audio");
                if (!ytMatch) throw new Error("No results found on YouTube.");

                const parsed = parseYTResult(ytMatch);
                
                // Fetch Last.fm info to enrich metadata
                const lfm = await fetchLastFMTrackInfo(parsed.artist, parsed.title);
                
                metadata = {
                    title: lfm?.name || parsed.title,
                    artist: lfm?.artist?.name || parsed.artist,
                    displayArtist: lfm?.artist?.name || parsed.artist,
                    album: lfm?.album?.title || "Unknown Album",
                    albumUrl: lfm?.album?.url || null,
                    cover: getLfmImage(lfm) || ytMatch.thumbnail || ytMatch.image,
                    url: lfm?.url || null, // This will be the Last.fm track URL if available
                    lfmUrl: lfm?.url || null, // Explicitly for Last.fm
                    ytUrl: ytMatch.url,
                    durationMs: (ytMatch.seconds || 0) * 1000,
                    popularity: null,
                    ytViews: ytMatch.views,
                    isSpotify: false,
                    fullArtists: [{ name: lfm?.artist?.name || parsed.artist, url: lfm?.artist?.url || null }],
                    listeners: lfm?.listeners || null,
                    playcount: lfm?.playcount || null
                };
            }

            await this.downloadAndSendTrack(context, metadata, updateStatus, loading, isSlash);

        } catch (err) {
            await updateStatus(`❌ ${err.message || "Download failed."}`);
        }
    },

    async downloadAndSendTrack(context, meta, updateStatus, loading, isSlash) {
        const tempId = Date.now().toString() + Math.floor(Math.random() * 1000);
        const rawAudioPath = path.join(os.tmpdir(), `raw_${tempId}.m4a`);
        const tempMp3Path = path.join(os.tmpdir(), `song_${tempId}.mp3`);
        const coverPath = path.join(os.tmpdir(), `cover_${tempId}.jpg`);

        try {
            await updateStatus(`${loading} Downloading...`);
            
            if (!meta.ytUrl) throw new Error("No YouTube URL found for this track.");

            await updateStatus(`${loading} Downloading...`);

            const args = [
                "--rm-cache-dir",
                "-f", "bestaudio[ext=m4a]/bestaudio/best",
                "--no-playlist",
                "--no-warnings",
                "--force-ipv4",
                "--extractor-args", "youtube:player-client=android,web",
                "-o", rawAudioPath,
                meta.ytUrl
            ];

            await new Promise((resolve, reject) => {
                const ls = spawn("yt-dlp", args);
                let errorOutput = "";

                ls.stdout.on("data", (data) => console.log(`[YT-DLP] ${data}`));
                ls.stderr.on("data", (data) => {
                    errorOutput += data.toString();
                    console.error(`[YT-DLP ERROR] ${data}`);
                });

                ls.on("close", (code) => {
                    if (code === 0) resolve();
                    else {
                        const cleanError = errorOutput.split("\n").filter(l => l.includes("ERROR:")).join(" ") || "Unknown yt-dlp error";
                        reject(new Error(cleanError));
                    }
                });

                ls.on("error", (err) => {
                    reject(new Error(`Spawn error: ${err.message}`));
                });
            });

            if (!fs.existsSync(rawAudioPath)) throw new Error("Download failed - source file not found.");

            await updateStatus(`${loading} Downloading...`);

            await new Promise((resolve, reject) => {
                const ffmpeg = ffmpegInfo(rawAudioPath)
                    .setFfmpegPath(ffmpegPath)
                    .audioBitrate(320)
                    .toFormat("mp3")
                    .on("end", resolve)
                    .on("error", (err) => {
                        console.error("[FFMPEG ERROR]", err);
                        reject(err);
                    });

                ffmpeg
                    .outputOption("-metadata", `title=${safeMeta(meta.title)}`)
                    .outputOption("-metadata", `artist=${safeMeta(meta.artist)}`)
                    .outputOption("-metadata", `album=${safeMeta(meta.album)}`);

                if (meta.cover) {
                    fetch(meta.cover)
                        .then(r => r.buffer())
                        .then(buf => fs.writeFileSync(coverPath, buf))
                        .then(() => {
                            ffmpeg.input(coverPath);
                            ffmpeg.outputOptions([
                                "-map", "0:a", 
                                "-map", "1:v", 
                                "-id3v2_version", "3", 
                                "-metadata:s:v", "title=Cover",
                                "-metadata:s:v", "comment=Cover (front)"
                            ]);
                        })
                        .catch(err => console.warn("[COVER FETCH ERROR]", err.message))
                        .finally(() => ffmpeg.save(tempMp3Path));
                } else {
                    ffmpeg.save(tempMp3Path);
                }
            });

            if (!fs.existsSync(tempMp3Path)) throw new Error("Processing failed - output file not found.");

            const finalName = `${meta.displayArtist} - ${meta.title}.mp3`.replace(/[\\/:*?"<>|]/g, "");
            const attachment = new AttachmentBuilder(tempMp3Path, { name: finalName });

            await updateStatus({
                content: "",
                files: [attachment]
            });

            // Immediate cleanup
            if (fs.existsSync(rawAudioPath)) fs.unlink(rawAudioPath, () => {});
            if (fs.existsSync(tempMp3Path)) fs.unlink(tempMp3Path, () => {});
            if (fs.existsSync(coverPath)) fs.unlink(coverPath, () => {});

        } catch (err) {
            console.error("[DOWNLOAD ERROR]", err);
            await updateStatus(`❌ Failed to download: ${err.message || "Unknown error"}`);
            // Cleanup on error too
            if (fs.existsSync(rawAudioPath)) fs.unlink(rawAudioPath, () => {});
            if (fs.existsSync(tempMp3Path)) fs.unlink(tempMp3Path, () => {});
            if (fs.existsSync(coverPath)) fs.unlink(coverPath, () => {});
        }
    },

    name: "spotify",
    aliases: ["sp"]
};

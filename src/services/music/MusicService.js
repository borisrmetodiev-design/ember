// MusicService — central orchestrator for the music system
// Manages PlayerService instances, coordinates with QueueService,
// handles now-playing embed updates, and routes button interactions.

const PlayerService = require("./PlayerService");
const QueueService  = require("./QueueService");
const DownloadService = require("./DownloadService");
const SearchService  = require("./SearchService");

const {
    buildNowPlayingEmbed,
    buildTrackAddedEmbed,
    buildPlaylistAddedEmbed,
    buildQueueEmbed,
    buildMusicErrorEmbed,
    buildInfoEmbed,
    buildControlButtons,
} = require("../../utils/music/embeds");

const { LIMITS, LOOP_MODES, LOOP_LABELS, BUTTON_IDS } = require("../../utils/music/constants");
const { MessageFlags } = require("discord.js");

// per-guild PlayerService instances
const players = new Map();

// guilds where the next trackEnd event should be ignored (manual navigation)
const suppressTrackEnd = new Set();

// ─── Player instance management ───────────────────────────────────────────────

function getPlayer(guildId) {
    if (!players.has(guildId)) {
        const player = new PlayerService(guildId);

        player.on("trackEnd", () => {
            _onTrackEnd(guildId).catch(err => {
                console.error(`[MusicService][${guildId}] trackEnd handler error:`, err.message);
            });
        });

        player.on("error", (err) => {
            console.error(`[MusicService][${guildId}] Player error:`, err.message);
            _onTrackEnd(guildId).catch(() => {});
        });

        player.on("disconnected", () => {
            console.warn(`[MusicService][${guildId}] Disconnected from voice.`);
            cleanup(guildId);
        });

        players.set(guildId, player);
    }
    return players.get(guildId);
}

// ─── Track end / next track logic ─────────────────────────────────────────────

async function _onTrackEnd(guildId) {
    if (suppressTrackEnd.has(guildId)) {
        suppressTrackEnd.delete(guildId);
        return;
    }

    const queue = QueueService.get(guildId);
    if (!queue) return;

    stopNowPlayingUpdater(guildId);

    const lastTrack = queue.current;
    let { next, shouldStop } = QueueService.advance(guildId);

    if ((shouldStop || !next) && queue.autoplay && lastTrack) {
        try {
            const related = await SearchService.getRelatedTracks(lastTrack, lastTrack.requester);
            if (related.length > 0) {
                QueueService.add(guildId, related);
                next = QueueService.setCurrentFromQueue(guildId);
                shouldStop = !next;
            }
        } catch (err) {
            console.error(`[MusicService][${guildId}] Autoplay error:`, err.message);
        }
    }

    if (shouldStop || !next) {
        await _sendIdle(guildId, queue);
        await _scheduleIdleCleanup(guildId);
        return;
    }

    await _startTrack(guildId, next);
}

async function _startTrack(guildId, track) {
    const queue  = QueueService.get(guildId);
    const player = getPlayer(guildId);
    if (!queue || !player) return;

    try {
        const resource = await DownloadService.getResource(track, queue.seekOffset || 0);
        player.play(resource);
        player.setVolume(queue.volume);
        queue.paused = false;

        // Send / update now-playing message
        await _sendNowPlaying(guildId, track, queue);

        // Start periodic update
        startNowPlayingUpdater(guildId);

    } catch (err) {
        console.error(`[MusicService][${guildId}] Failed to start track "${track.title}":`, err.message);

        // Try to notify the text channel
        if (queue.textChannel) {
            const embed = buildMusicErrorEmbed(`Failed to play **${track.title}**: ${err.message}\nSkipping to next track...`);
            queue.textChannel.send({ embeds: [embed] }).catch(() => {});
        }

        // Skip to next
        await _onTrackEnd(guildId);
    }
}

// ─── Now Playing embed management ─────────────────────────────────────────────

async function _sendNowPlaying(guildId, track, queue) {
    if (!queue.textChannel) return;

    const elapsed  = QueueService.get(guildId)?.seekOffset || 0;
    const embed    = buildNowPlayingEmbed(track, queue, elapsed);
    const buttons  = buildControlButtons(queue);

    try {
        // Delete old NP message if it exists
        if (queue.nowPlayingMsg) {
            queue.nowPlayingMsg.delete().catch(() => {});
            queue.nowPlayingMsg = null;
        }

        const msg = await queue.textChannel.send({
            embeds: [embed],
            components: buttons,
        });
        queue.nowPlayingMsg = msg;
    } catch (err) {
        console.error(`[MusicService][${guildId}] Failed to send NP embed:`, err.message);
    }
}

async function _updateNowPlaying(guildId) {
    const queue = QueueService.get(guildId);
    if (!queue?.current || !queue.nowPlayingMsg) return;

    const player  = getPlayer(guildId);
    const elapsed = (queue.seekOffset || 0) + (player?.elapsedSeconds || 0);
    const embed   = buildNowPlayingEmbed(queue.current, queue, elapsed);
    const buttons = buildControlButtons(queue);

    try {
        await queue.nowPlayingMsg.edit({ embeds: [embed], components: buttons });
    } catch (err) {
        // If message was deleted externally, clear reference
        if (err.code === 10008) {
            queue.nowPlayingMsg = null;
        }
    }
}

function startNowPlayingUpdater(guildId) {
    const queue = QueueService.get(guildId);
    if (!queue) return;

    stopNowPlayingUpdater(guildId);
    queue.updateInterval = setInterval(() => {
        _updateNowPlaying(guildId).catch(() => {});
    }, LIMITS.NP_UPDATE_INTERVAL);
}

function stopNowPlayingUpdater(guildId) {
    const queue = QueueService.get(guildId);
    if (queue?.updateInterval) {
        clearInterval(queue.updateInterval);
        queue.updateInterval = null;
    }
}

// ─── Idle handling ─────────────────────────────────────────────────────────────

async function _sendIdle(guildId, queue) {
    if (!queue?.textChannel) return;
    try {
        const embed = buildInfoEmbed("Queue Complete", "No more tracks in the queue. Add more with `/play`!");
        await queue.textChannel.send({ embeds: [embed] });
    } catch {}
}

async function _scheduleIdleCleanup(guildId) {
    await new Promise(resolve => setTimeout(resolve, LIMITS.IDLE_TIMEOUT));

    const queue = QueueService.get(guildId);
    if (queue && !queue.current) {
        cleanup(guildId);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start or add to playback for a guild.
 * @param {object} options
 * @param {string}      options.guildId
 * @param {VoiceChannel} options.voiceChannel
 * @param {TextChannel}  options.textChannel
 * @param {Track[]}      options.tracks
 * @param {object}       options.requester - Discord user
 * @param {boolean}      options.isPlaylist
 * @param {string}       options.playlistName
 */
async function play({ guildId, voiceChannel, textChannel, tracks, requester, isPlaylist = false, playlistName = "" }) {
    if (!tracks || tracks.length === 0) {
        throw new Error("No tracks provided.");
    }

    const player = getPlayer(guildId);
    const queue  = QueueService.getOrCreate(guildId, {
        textChannel,
        voiceChannel,
        volume: LIMITS.DEFAULT_VOLUME,
    });

    // Connect to voice (or move if already connected elsewhere)
    await player.connect(voiceChannel);
    player.setVolume(queue.volume);

    const wasPlaying = !!queue.current;

    // Add tracks to queue
    QueueService.add(guildId, tracks);

    // If nothing is playing, start immediately
    if (!wasPlaying && player.isIdle) {
        const first = QueueService.setCurrentFromQueue(guildId);
        if (first) {
            await _startTrack(guildId, first);
        }
        return { started: true };
    }

    return { started: false };
}

/**
 * Skip the current track.
 */
async function skip(guildId) {
    const queue  = QueueService.get(guildId);
    const player = getPlayer(guildId);
    if (!queue || !player) throw new Error("Nothing is playing.");

    stopNowPlayingUpdater(guildId);
    player.stop();
    // trackEnd event fires → _onTrackEnd → next track
}

/**
 * Stop playback and clear queue.
 */
async function stop(guildId) {
    const queue  = QueueService.get(guildId);
    const player = getPlayer(guildId);
    if (!queue || !player) throw new Error("Nothing is playing.");

    stopNowPlayingUpdater(guildId);
    QueueService.clear(guildId);
    queue.current = null;
    queue.paused  = false;
    player.stop();
}

/**
 * Pause playback.
 */
function pause(guildId) {
    const queue  = QueueService.get(guildId);
    const player = getPlayer(guildId);
    if (!queue || !player) throw new Error("Nothing is playing.");
    if (queue.paused) throw new Error("Already paused.");

    player.pause();
    QueueService.setPaused(guildId, true);
    stopNowPlayingUpdater(guildId);
}

/**
 * Resume playback.
 */
function resume(guildId) {
    const queue  = QueueService.get(guildId);
    const player = getPlayer(guildId);
    if (!queue || !player) throw new Error("Nothing is playing.");
    if (!queue.paused) throw new Error("Not paused.");

    player.resume();
    QueueService.setPaused(guildId, false);
    startNowPlayingUpdater(guildId);
}

/**
 * Set volume (0-100).
 */
function setVolume(guildId, vol) {
    const queue  = QueueService.get(guildId);
    const player = getPlayer(guildId);
    if (!queue) throw new Error("No active queue.");

    QueueService.setVolume(guildId, vol);
    player.setVolume(vol);
}

/**
 * Seek to a position in the current track.
 */
async function seek(guildId, seconds) {
    const queue  = QueueService.get(guildId);
    const player = getPlayer(guildId);
    if (!queue?.current || !player) throw new Error("Nothing is playing.");

    stopNowPlayingUpdater(guildId);
    QueueService.setSeekOffset(guildId, seconds);

    const resource = await DownloadService.getResource(queue.current, seconds);
    player.play(resource);
    player.setVolume(queue.volume);
    queue.paused = false;

    startNowPlayingUpdater(guildId);
}

/**
 * Jump to a specific 1-based position in the upcoming queue.
 */
async function jumpTo(guildId, position) {
    const queue  = QueueService.get(guildId);
    const player = getPlayer(guildId);
    if (!queue) throw new Error("No active queue.");

    const idx = position - 1;
    if (idx < 0 || idx >= queue.tracks.length) {
        throw new Error(`Invalid position. The queue has ${queue.tracks.length} upcoming track${queue.tracks.length !== 1 ? "s" : ""}.`);
    }

    stopNowPlayingUpdater(guildId);

    const track = queue.tracks.splice(idx, 1)[0];
    queue.current    = track;
    queue.startedAt  = Date.now();
    queue.seekOffset = 0;
    queue.paused     = false;

    await _startTrack(guildId, track);
    return track;
}

/**
 * Go to the previous track.
 */
async function previous(guildId) {
    const queue  = QueueService.get(guildId);
    const player = getPlayer(guildId);
    if (!queue) throw new Error("No active queue.");

    const prev = QueueService.previous(guildId);
    if (!prev) throw new Error("No previous track.");

    stopNowPlayingUpdater(guildId);
    suppressTrackEnd.add(guildId);
    player.stop();
    await _startTrack(guildId, prev);
}

/**
 * Full cleanup — disconnect, destroy queue, remove player.
 */
function cleanup(guildId) {
    stopNowPlayingUpdater(guildId);
    const player = players.get(guildId);
    if (player) {
        player.disconnect();
        players.delete(guildId);
    }
    QueueService.destroy(guildId);
    console.log(`[MusicService][${guildId}] Cleaned up.`);
}

// ─── Button handler ───────────────────────────────────────────────────────────

async function handleButton(interaction) {
    const { customId, guild, user } = interaction;
    const guildId = guild?.id;

    if (!guildId) {
        return interaction.reply({ content: "Music commands only work in servers.", flags: MessageFlags.Ephemeral });
    }

    const queue  = QueueService.get(guildId);
    const player = players.get(guildId);

    if (!queue || !queue.current) {
        return interaction.reply({ content: "Nothing is currently playing.", flags: MessageFlags.Ephemeral });
    }

    // Check that user is in a voice channel
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member?.voice?.channel) {
        return interaction.reply({ content: "You need to be in a voice channel to use music controls.", flags: MessageFlags.Ephemeral });
    }

    try {
        switch (customId) {
            case BUTTON_IDS.PAUSE: {
                pause(guildId);
                await interaction.reply({ content: `⏸ Paused.`, flags: MessageFlags.Ephemeral });
                await _updateNowPlaying(guildId);
                break;
            }
            case BUTTON_IDS.RESUME: {
                resume(guildId);
                await interaction.reply({ content: `▶ Resumed.`, flags: MessageFlags.Ephemeral });
                await _updateNowPlaying(guildId);
                break;
            }
            case BUTTON_IDS.SKIP: {
                await interaction.reply({ content: `⏭ Skipping...`, flags: MessageFlags.Ephemeral });
                await skip(guildId);
                break;
            }
            case BUTTON_IDS.PREVIOUS: {
                await interaction.reply({ content: `⏮ Going back...`, flags: MessageFlags.Ephemeral });
                await previous(guildId);
                break;
            }
            case BUTTON_IDS.STOP: {
                await stop(guildId);
                cleanup(guildId);
                await interaction.reply({ content: `⏹ Stopped and cleared queue.`, flags: MessageFlags.Ephemeral });
                break;
            }
            case BUTTON_IDS.SHUFFLE: {
                QueueService.shuffle(guildId);
                await interaction.reply({ content: `🔀 Queue shuffled.`, flags: MessageFlags.Ephemeral });
                await _updateNowPlaying(guildId);
                break;
            }
            case BUTTON_IDS.LOOP: {
                const current = queue.loop;
                const next = current === LOOP_MODES.NONE ? LOOP_MODES.SONG
                           : current === LOOP_MODES.SONG  ? LOOP_MODES.QUEUE
                           : LOOP_MODES.NONE;
                QueueService.setLoop(guildId, next);
                await interaction.reply({ content: `🔁 Loop set to: **${LOOP_LABELS[next]}**`, flags: MessageFlags.Ephemeral });
                await _updateNowPlaying(guildId);
                break;
            }
            case BUTTON_IDS.QUEUE_LIST: {
                const qEmbed = buildQueueEmbed(queue, 1);
                await interaction.reply({ embeds: [qEmbed], flags: MessageFlags.Ephemeral });
                break;
            }
            case BUTTON_IDS.VOL_DOWN: {
                const newVol = Math.max(0, queue.volume - 10);
                setVolume(guildId, newVol);
                await interaction.reply({ content: `🔉 Volume: \`${newVol}%\``, flags: MessageFlags.Ephemeral });
                await _updateNowPlaying(guildId);
                break;
            }
            case BUTTON_IDS.VOL_UP: {
                const newVol = Math.min(100, queue.volume + 10);
                setVolume(guildId, newVol);
                await interaction.reply({ content: `🔊 Volume: \`${newVol}%\``, flags: MessageFlags.Ephemeral });
                await _updateNowPlaying(guildId);
                break;
            }
            default: {
                await interaction.reply({ content: "Unknown button.", flags: MessageFlags.Ephemeral });
            }
        }
    } catch (err) {
        console.error(`[MusicService] Button handler error (${customId}):`, err.message);
        const embed = buildMusicErrorEmbed(err.message || "An error occurred.");
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        } catch {}
    }
}

module.exports = {
    play,
    skip,
    stop,
    pause,
    resume,
    setVolume,
    seek,
    jumpTo,
    previous,
    cleanup,
    handleButton,
    startNowPlayingUpdater,
    stopNowPlayingUpdater,
    getPlayer,
};

// PlayerService — @discordjs/voice AudioPlayer and VoiceConnection wrapper
// Handles connect, disconnect, play, pause, resume, stop, volume, seek

const {
    joinVoiceChannel,
    createAudioPlayer,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
} = require("@discordjs/voice");

const EventEmitter = require("events");

class PlayerService extends EventEmitter {
    constructor(guildId) {
        super();
        this.guildId    = guildId;
        this.player     = createAudioPlayer();
        this.connection = null;
        this.resource   = null;
        this.volume     = 80; // default

        this._setupPlayerEvents();
    }

    // ─── Setup ───────────────────────────────────────────────────────────────

    _setupPlayerEvents() {
        this.player.on(AudioPlayerStatus.Idle, () => {
            this.emit("trackEnd");
        });

        this.player.on("error", (err) => {
            console.error(`[PlayerService][${this.guildId}] Player error:`, err.message);
            this.emit("error", err);
        });

        this.player.on(AudioPlayerStatus.Playing, () => {
            this.emit("playing");
        });

        this.player.on(AudioPlayerStatus.Paused, () => {
            this.emit("paused");
        });
    }

    // ─── Voice Connection ─────────────────────────────────────────────────────

    /**
     * Join a voice channel.
     * @param {VoiceChannel} voiceChannel
     * @returns {VoiceConnection}
     */
    async connect(voiceChannel) {
        // Reuse existing connection if already in the same channel
        const existing = getVoiceConnection(this.guildId);
        if (existing) {
            if (existing.joinConfig.channelId === voiceChannel.id) {
                this.connection = existing;
                this.connection.subscribe(this.player);
                return this.connection;
            }
            // Move to new channel
            existing.destroy();
        }

        this.connection = joinVoiceChannel({
            channelId:      voiceChannel.id,
            guildId:        voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf:       true,
            selfMute:       false,
        });

        // Wait until ready
        try {
            await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
        } catch (err) {
            this.connection.destroy();
            this.connection = null;
            throw new Error("Failed to join voice channel (timeout).");
        }

        // Handle unexpected disconnects
        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                // Try to reconnect for 5 seconds
                await Promise.race([
                    entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch {
                this.emit("disconnected");
                if (this.connection) {
                    this.connection.destroy();
                    this.connection = null;
                }
            }
        });

        this.connection.subscribe(this.player);
        return this.connection;
    }

    /**
     * Disconnect from voice channel.
     */
    disconnect() {
        try {
            this.player.stop(true);
            if (this.connection) {
                this.connection.destroy();
                this.connection = null;
            }
        } catch (err) {
            console.error(`[PlayerService][${this.guildId}] Disconnect error:`, err.message);
        }
    }

    // ─── Playback ─────────────────────────────────────────────────────────────

    /**
     * Play an AudioResource.
     * @param {AudioResource} resource
     */
    play(resource) {
        this.resource = resource;
        this._applyVolume(resource);
        this.player.play(resource);
    }

    /**
     * Pause playback.
     */
    pause() {
        return this.player.pause(true);
    }

    /**
     * Resume playback.
     */
    resume() {
        return this.player.unpause();
    }

    /**
     * Stop playback (triggers Idle → trackEnd event).
     */
    stop() {
        this.player.stop(true);
    }

    /**
     * Set volume (0–100). Applies to current and future resources.
     * @param {number} vol
     */
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(100, vol));
        if (this.resource?.volume) {
            this._applyVolume(this.resource);
        }
    }

    /**
     * Apply volume to a resource using inlineVolume.
     */
    _applyVolume(resource) {
        if (resource?.volume) {
            resource.volume.setVolume(this.volume / 100);
        }
    }

    // ─── State ────────────────────────────────────────────────────────────────

    get isPaused() {
        return this.player.state.status === AudioPlayerStatus.Paused;
    }

    get isPlaying() {
        return this.player.state.status === AudioPlayerStatus.Playing;
    }

    get isIdle() {
        return this.player.state.status === AudioPlayerStatus.Idle;
    }

    /**
     * Get elapsed playback seconds for the current resource.
     * @returns {number}
     */
    get elapsedSeconds() {
        const ms = this.resource?.playbackDuration ?? 0;
        return Math.floor(ms / 1000);
    }
}

module.exports = PlayerService;

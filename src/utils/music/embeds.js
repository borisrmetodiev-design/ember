// Music embed builders — matches Ember bot's existing embed style:
//   setColor("#ff6600") primary, setColor("#ff3300") error, setColor("#2f3136") neutral
//   setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
//   setFooter({ text: "Service • context" })
//   setTimestamp() always

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const { COLORS, EMOJIS, SOURCE_LABELS, SOURCE_EMOJIS, LOOP_LABELS, BUTTON_IDS, LIMITS } = require("./constants");
const { formatDuration, formatSeconds, truncate, queuePosition } = require("./formatters");
const { buildProgressBar, buildVolumeBar } = require("./progressBar");

function formatRequester(requester) {
    if (!requester) return "Unknown";
    if (typeof requester === "string") return requester;
    return requester.username || requester.tag || "Unknown";
}

// ─── Now Playing ────────────────────────────────────────────────────────────

/**
 * Build the Now Playing embed with progress bar.
 * @param {object} track    - current Track object
 * @param {object} queue    - GuildQueue object
 * @param {number} elapsed  - elapsed playback seconds
 * @returns {EmbedBuilder}
 */
function buildNowPlayingEmbed(track, queue, elapsed = 0) {
    const sourceEmoji = SOURCE_EMOJIS[track.source] || "🎵";
    const sourceLabel = SOURCE_LABELS[track.source] || "Unknown";
    const loopLabel = LOOP_LABELS[queue.loop] || "Off";

    const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setAuthor({
            name: `${EMOJIS.MUSIC} Now Playing`,
            iconURL: track.requester?.displayAvatarURL?.({ dynamic: true }) || null,
        })
        .setTitle(truncate(track.title, 200))
        .setURL(track.url || null)
        .addFields(
            { name: "Artist",    value: track.artist || "Unknown",  inline: true },
            { name: "Source",    value: `${sourceEmoji} ${sourceLabel}`, inline: true },
            { name: "Requested", value: formatRequester(track.requester), inline: true },
            { name: "Loop",      value: loopLabel,  inline: true },
        )
        .setFooter({ text: `ember • music` })
        .setTimestamp();

    if (track.thumbnail) embed.setThumbnail(track.thumbnail);

    return embed;
}

// ─── Track Added ────────────────────────────────────────────────────────────

/**
 * Build embed for when a single track is added to the queue.
 */
function buildTrackAddedEmbed(track, queue, requester) {
    const position = queue.tracks.length;
    const positionLabel = queue.current ? queuePosition(position - 1) : "Up next";

    return new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setAuthor({
            name: requester.username,
            iconURL: requester.displayAvatarURL?.({ dynamic: true }) || null,
        })
        .setTitle(`${EMOJIS.MUSIC} Added to Queue`)
        .setDescription(`**[${truncate(track.title, 60)}](${track.url || "https://discord.com"})**`)
        .addFields(
            { name: "Artist",   value: truncate(track.artist || "Unknown", 40), inline: true },
            { name: "Duration", value: track.duration ? formatDuration(track.duration) : "Unknown", inline: true },
            { name: "Position", value: positionLabel, inline: true },
        )
        .setFooter({ text: "ember • music" })
        .setTimestamp()
        .setThumbnail(track.thumbnail || null);
}

// ─── Playlist Added ──────────────────────────────────────────────────────────

/**
 * Build embed for when a playlist is added to the queue.
 */
function buildPlaylistAddedEmbed(name, count, source, requester) {
    const sourceEmoji = SOURCE_EMOJIS[source] || "🎵";
    const sourceLabel = SOURCE_LABELS[source] || "Unknown";

    return new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setAuthor({
            name: requester.username,
            iconURL: requester.displayAvatarURL?.({ dynamic: true }) || null,
        })
        .setTitle(`${EMOJIS.MUSIC} Playlist Added`)
        .setDescription(`**${truncate(name, 100)}**`)
        .addFields(
            { name: "Tracks",   value: `${count} tracks`, inline: true },
            { name: "Source",   value: `${sourceEmoji} ${sourceLabel}`, inline: true },
        )
        .setFooter({ text: "ember • music" })
        .setTimestamp();
}

// ─── Queue List ─────────────────────────────────────────────────────────────

/**
 * Build the paginated queue embed.
 * @param {object} queue  - GuildQueue object
 * @param {number} page   - 1-based page number
 */
function buildQueueEmbed(queue, page = 1) {
    const pageSize = LIMITS.QUEUE_PAGE_SIZE;
    const totalTracks = queue.tracks.length;
    const totalPages = Math.max(1, Math.ceil(totalTracks / pageSize));
    page = Math.max(1, Math.min(page, totalPages));

    const start = (page - 1) * pageSize;
    const slice = queue.tracks.slice(start, start + pageSize);

    const currentTitle = queue.current
        ? `${EMOJIS.MUSIC} [${truncate(queue.current.title, 60)}](${queue.current.url || "https://discord.com"})`
        : "Nothing playing";

    let queueDesc = "";
    if (slice.length === 0) {
        queueDesc = "*Queue is empty*";
    } else {
        queueDesc = slice
            .map((t, i) => {
                const pos = start + i + 1;
                const dur = t.duration ? `\`${formatDuration(t.duration)}\`` : "`?:??`";
                return `\`${pos}.\` [${truncate(t.title, 55)}](${t.url || "https://discord.com"}) — ${dur}`;
            })
            .join("\n");
    }

    const totalDuration = queue.tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    const loopLabel = LOOP_LABELS[queue.loop] || "Off";

    return new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`📃 Queue`)
        .addFields(
            { name: "Now Playing",  value: currentTitle, inline: false },
            { name: `Up Next (Page ${page}/${totalPages})`, value: queueDesc || "*Empty*", inline: false },
        )
        .addFields(
            { name: "Total Tracks",   value: `${totalTracks}`, inline: true },
            { name: "Total Duration", value: formatDuration(totalDuration), inline: true },
            { name: "Loop",           value: loopLabel, inline: true },
            { name: "Volume",         value: `${queue.volume}%`, inline: true },
            { name: "Autoplay",       value: queue.autoplay ? "On" : "Off", inline: true },
        )
        .setFooter({ text: `ember • music • Page ${page} of ${totalPages}` })
        .setTimestamp();
}

// ─── Error ───────────────────────────────────────────────────────────────────

/**
 * Build a music-specific error embed (consistent with bot's error style).
 */
function buildMusicErrorEmbed(description) {
    return new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(`${EMOJIS.ERROR || "❌"} Music Error`)
        .setDescription(description)
        .setFooter({ text: "ember • music" })
        .setTimestamp();
}

/**
 * Build a simple success/info embed.
 */
function buildInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: "ember • music" })
        .setTimestamp();
}

// ─── Control Buttons ─────────────────────────────────────────────────────────

/**
 * Build the music control button row(s).
 * @param {object} queue - GuildQueue (used to determine paused state, loop, etc.)
 * @returns {ActionRowBuilder[]}
 */
function buildControlButtons(queue) {
    const isPaused = queue?.paused ?? false;
    const hasQueue = queue?.tracks?.length > 0;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(BUTTON_IDS.PREVIOUS)
            .setEmoji(EMOJIS.PREVIOUS)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!(queue?.history?.length > 0)),

        new ButtonBuilder()
            .setCustomId(isPaused ? BUTTON_IDS.RESUME : BUTTON_IDS.PAUSE)
            .setEmoji(isPaused ? EMOJIS.RESUME : EMOJIS.PAUSE)
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary)
            .setDisabled(!queue?.current),

        new ButtonBuilder()
            .setCustomId(BUTTON_IDS.SKIP)
            .setEmoji(EMOJIS.SKIP)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!queue?.current),

        new ButtonBuilder()
            .setCustomId(BUTTON_IDS.STOP)
            .setEmoji(EMOJIS.STOP)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!queue?.current),

        new ButtonBuilder()
            .setCustomId(BUTTON_IDS.SHUFFLE)
            .setEmoji(EMOJIS.SHUFFLE)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!hasQueue),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(BUTTON_IDS.LOOP)
            .setEmoji(EMOJIS.LOOP)
            .setStyle(queue?.loop !== "none" ? ButtonStyle.Success : ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(BUTTON_IDS.QUEUE_LIST)
            .setEmoji(EMOJIS.QUEUE_LIST)
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(BUTTON_IDS.VOL_DOWN)
            .setEmoji(EMOJIS.VOL_DOWN)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled((queue?.volume ?? 80) <= 0),

        new ButtonBuilder()
            .setCustomId(BUTTON_IDS.VOL_UP)
            .setEmoji(EMOJIS.VOL_UP)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled((queue?.volume ?? 80) >= 100),
    );

    return [row1, row2];
}

module.exports = {
    buildNowPlayingEmbed,
    buildTrackAddedEmbed,
    buildPlaylistAddedEmbed,
    buildQueueEmbed,
    buildMusicErrorEmbed,
    buildInfoEmbed,
    buildControlButtons,
};

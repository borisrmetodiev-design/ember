const { EmbedBuilder } = require("discord.js");
const path = require("path");
const { readJSON } = require("../utils/database");

const dbPath = path.join(__dirname, "..", "storage", "data", "greetchannels.json");

async function readDb() {
    try {
        return await readJSON(dbPath);
    } catch (e) {
        console.error("Error reading greetchannels.json", e);
        return {};
    }
}

module.exports = (client) => {
    client.on("guildMemberAdd", async (member) => {
        try {
            const db = await readDb();
            const config = db[member.guild.id];

            if (!config || !config.channelId) return;

            const channel = member.guild.channels.cache.get(config.channelId);
            if (!channel) return;

            const title = config.title
                .replace(/{server}/g, member.guild.name)
                .replace(/{user}/g, member.user.username)
                .replace(/{count}/g, member.guild.memberCount.toString());

            const description = config.description
                .replace(/{server}/g, member.guild.name)
                .replace(/{user}/g, `<@${member.id}>`)
                .replace(/{count}/g, member.guild.memberCount.toString());

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(config.color || 0x00FF00);

            if (config.image) {
                embed.setImage(config.image);
            } else {
                embed.setThumbnail(member.user.displayAvatarURL({ extension: 'png' }));
            }

            await channel.send({ embeds: [embed] });

        } catch (err) {
            console.error(`Error in guildMemberAdd for guild ${member.guild.id}:`, err);
        }
    });
};

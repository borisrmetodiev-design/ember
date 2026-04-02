const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "leave",
    description: "Leaves a server (Owner only)",

    async executePrefix(message, args, client) {
        try {
            const authorId = message.author.id;
            const allowedIds = new Set([
                process.env.BORIS_ID_1,
                process.env.BORIS_ID_2
            ].filter(Boolean));

            // Permission check
            if (!allowedIds.has(authorId)) throw { code: "021" }; // Permission denied

            let guildToLeave;

            if (args.length > 0) {
                const guildId = args[0];
                guildToLeave = client.guilds.cache.get(guildId);
                
                if (!guildToLeave) {
                    const embed = new EmbedBuilder()
                        .setColor("#ff0000")
                        .setTitle("Error")
                        .setDescription(`The bot is not currently in a server with the ID \`${guildId}\`.`)
                        .setTimestamp();
                    return message.reply({ embeds: [embed] });
                }
            } else {
                if (!message.guild) throw { code: "001" }; // Bot not in Guild
                guildToLeave = message.guild;
            }

            const guildName = guildToLeave.name;
            const guildId = guildToLeave.id;

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setTitle("Leaving Server")
                .setDescription(`Successfully leaving the server **${guildName}** (\`${guildId}\`).`)
                .setTimestamp();

            try {
                await message.reply({ embeds: [embed] });
            } catch (err) {
                // Ignore if we can't reply
            }

            await guildToLeave.leave();

        } catch (err) {
            throw err.code ? err : { code: "014", err }; // fallback
        }
    }
};

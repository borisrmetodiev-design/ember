const { buildErrorEmbed } = require("../utils/errorHandler");

module.exports = (client, prefix) => {
    client.on("messageCreate", async (message) => {
        if (!message.content.startsWith(prefix) || message.author.bot) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        const command = client.commands.get(commandName);

        if (!command) return;

        try {
            await command.executePrefix(message, args);
        } catch (err) {
            const { embed, components } = buildErrorEmbed(err.code || "004", err.err || err);
            await message.reply({ embeds: [embed], components });
        }
    });
};
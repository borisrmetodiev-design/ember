const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "update",
    aliases: ["reload", "refresh"],
    description: "Hot‑reload all command files",

    async executePrefix(message, args, client) {
        const authorId = message.author.id;
        const allowedIds = new Set([
            process.env.BORIS_ID_1,
            process.env.BORIS_ID_2
        ].filter(Boolean));

        if (!allowedIds.has(authorId)) {
            return message.reply("You do not have permission to use this command.");
        }

        const commandsDir = path.join(__dirname, "..");
        let reloaded = 0;
        let errors = 0;

        function getAllCommandFiles(dir) {
            let results = [];
            const list = fs.readdirSync(dir);

            for (const file of list) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);

                if (stat.isDirectory()) {
                    results = results.concat(getAllCommandFiles(filePath));
                } else if (file.endsWith(".js")) {
                    results.push(filePath);
                }
            }
            return results;
        }

        const files = getAllCommandFiles(commandsDir);

        for (const filePath of files) {
            try {
                delete require.cache[require.resolve(filePath)];
                const command = require(filePath);

                // Reload slash commands
                if (command.data) {
                    client.slashCommands.set(command.data.name, command);
                }

                // Reload prefix commands + aliases
                if (command.name) {
                    client.prefixCommands.set(command.name, command);

                    if (command.aliases) {
                        for (const alias of command.aliases) {
                            client.prefixCommands.set(alias, command);
                        }
                    }
                }

                reloaded++;
            } catch (err) {
                console.error("Failed to reload:", filePath, err);
                errors++;
            }
        }

        const embed = new EmbedBuilder()
            .setColor("#ff6600")
            .setTitle("🔄 Commands Reloaded")
            .setDescription(
                `All command files have been hot‑reloaded.\n\n` +
                `**Reloaded:** \`${reloaded}\`\n` +
                `**Errors:** \`${errors}\``
            )
            .setFooter({ text: "Ember Status — Developer Tools" })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }
};
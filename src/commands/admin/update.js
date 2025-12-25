const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "update",
    aliases: ["reload", "refresh"],
    description: "Hot‑reload all command files",

    async executePrefix(message, args, client) {
        try {
            // Guild check
            if (!message.guild) throw { code: "001" }; // Bot not in Guild / missing access

            const authorId = message.author.id;
            const allowedIds = new Set([
                process.env.BORIS_ID_1,
                process.env.BORIS_ID_2
            ].filter(Boolean));

            // Permission check
            if (!allowedIds.has(authorId)) throw { code: "017" }; // Permission denied

            // Validate env IDs
            for (const id of allowedIds) {
                if (!/^\d{17,19}$/.test(id)) throw { code: "009" }; // Invalid User ID format
            }

            const commandsDir = path.join(__dirname, "..");
            let reloaded = 0;
            let errors = 0;

            function getAllCommandFiles(dir) {
                try {
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
                } catch (err) {
                    throw { code: "015", err }; // External APIs failed to load (fs)
                }
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
                    throw { code: "018", err }; // Command reload failed - Syntax Errors
                }
            }

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setTitle("Commands Reloaded")
                .setDescription(
                    `All command files have been hot‑reloaded.\n\n` +
                    `**Reloaded:** \`${reloaded}\`\n` +
                    `**Errors:** \`${errors}\``
                )
                .setFooter({ text: "Ember Status — Developer Tools" })
                .setTimestamp();

            try {
                return message.reply({ embeds: [embed] });
            } catch (err) {
                throw { code: "014", err }; // Discord API request failed
            }
        } catch (err) {
            throw err.code ? err : { code: "015", err }; // fallback
        }
    }
};
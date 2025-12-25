require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const categories = fs.readdirSync(commandsPath);

for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith(".js"));

    for (const file of files) {
        const command = require(path.join(categoryPath, file));

        if (command.data) {
            const json = command.data.toJSON();

            // ⭐ Required for DM slash commands + user installs
            json.integration_types = [0, 1]; // 0 = Guild Install, 1 = User Install
            json.contexts = [0, 1, 2];       // 0 = Guild, 1 = DM, 2 = Private Channel

            commands.push(json);
        }
    }
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log("Refreshing global slash commands...");

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );

        console.log("Slash commands registered globally (DMs enabled).");
    } catch (err) {
        console.error("Error deploying commands:");
        console.error(err);
    }
})();
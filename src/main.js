if (process.env.AUTO_DEPLOY === "true") {
    require("./deploy-commands.js");
}

require("dotenv").config();
const {
    Client,
    GatewayIntentBits,
    Partials,
    Collection,
    MessageFlags
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const logs = require("./commands/admin/logs");
const { startKeepAliveServer } = require("./services/keep_alive");

// Import error handler
const { buildErrorEmbed, handleErrorButton } = require("./utils/errorHandler");

// Create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

// Prefix logic
let prefix;
switch (process.env.HOST_ENV) {
    case "local":
    case "pvc":
        prefix = "\\\\"; // double backslash
        break;
    case "server":
    case "koyeb":
        prefix = "\\";   // single backslash
        break;
    default:
        prefix = "\\";    // fallback if HOST_ENV not set
}

// Command maps
client.slashCommands = new Collection();
client.prefixCommands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, "commands");
const categories = fs.readdirSync(commandsPath);

for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith(".js"));

    for (const file of files) {
        const command = require(path.join(categoryPath, file));

        // Slash command
        if (command.data) {
            client.slashCommands.set(command.data.name, command);
        }

        // Prefix command
        if (command.name) {
            client.prefixCommands.set(command.name, command);

            if (command.aliases) {
                for (const alias of command.aliases) {
                    client.prefixCommands.set(alias, command);
                }
            }
        }
    }
}

client.once("ready", async () => {
    console.log(`🔥 Logged in as ${client.user.tag}`);
    await logs.sendStartupLog(client);
});



// Slash command handler
client.on("interactionCreate", async interaction => {
    try {
        // Slash commands
        if (interaction.isChatInputCommand()) {
            const command = client.slashCommands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.executeSlash(interaction);
            } catch (err) {
                console.error(`Error in command ${interaction.commandName}:`, err);
                const { embed, components } = buildErrorEmbed(err.code || "004", err.err || err);
                
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.editReply({ content: "", embeds: [embed], components });
                    } else {
                        await interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
                    }
                } catch (replyErr) {
                    console.error("Failed to send error message:", replyErr.message);
                }
            }
        }

        // Error detail button
        if (interaction.isButton() && interaction.customId.startsWith("error_details_")) {
            await handleErrorButton(interaction);
        }
    } catch (err) {
        console.error("Unhandled interaction error:", err);
    }
});

// Prefix command handler
client.on("messageCreate", async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = client.prefixCommands.get(commandName);
    if (!command) return;

    try {
        await command.executePrefix(message, args, client);
    } catch (err) {
        const { embed, components } = buildErrorEmbed(err.code || "004", err.err || err);
        await message.reply({ embeds: [embed], components });
    }
});

// Login
startKeepAliveServer();
client.login(process.env.TOKEN);
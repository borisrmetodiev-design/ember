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
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User]
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
client.snipes = new Map(); // Store deleted messages: channelId -> array of message objects
client.editsnipes = new Map(); // Store edited messages: channelId -> array of message objects
client.reactionsnipes = new Map(); // Store removed reactions: channelId -> array of reaction objects

// Load commands
const commandsPath = path.join(__dirname, "commands");
const categories = fs.readdirSync(commandsPath);

for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith(".js"));

    for (const file of files) {
        const loaded = require(path.join(categoryPath, file));
        const commands = Array.isArray(loaded) ? loaded : [loaded];

        for (const command of commands) {
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
}

client.once("clientReady", async () => {
    console.log(`Logged in as ${client.user.tag}`);
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

        // Autocomplete
        if (interaction.isAutocomplete()) {
            const command = client.slashCommands.get(interaction.commandName);
            if (!command || !command.autocomplete) return;

            try {
                await command.autocomplete(interaction);
            } catch (err) {
                console.error(`Autocomplete error for ${interaction.commandName}:`, err);
            }
        }

        // Error detail button
        if (interaction.isButton() && interaction.customId.startsWith("error_details_")) {
            await handleErrorButton(interaction);
        }

        // Last.fm confirmation button
        if (interaction.isButton() && interaction.customId.startsWith("lastfm_confirm_")) {
            const pendingAction = global.lastfmPendingActions?.[interaction.customId];

            if (!pendingAction) {
                return interaction.reply({
                    content: "This confirmation has expired. Please run the command again.",
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if the button clicker is the original user
            if (interaction.user.id !== pendingAction.userId) {
                return interaction.reply({
                    content: "You don't have permission to confirm this action.",
                    flags: MessageFlags.Ephemeral
                });
            }

            // Check if expired
            if (Date.now() > pendingAction.expiresAt) {
                delete global.lastfmPendingActions[interaction.customId];
                return interaction.reply({
                    content: "This confirmation has expired. Please run the command again.",
                    flags: MessageFlags.Ephemeral
                });
            }

            // Execute the action
            try {
                const lastfmSetup = require("./commands/lastfm/lastfmsetup");
                await lastfmSetup.handleConfirmation(
                    interaction,
                    pendingAction.mode,
                    pendingAction.username,
                    pendingAction.userId
                );
                delete global.lastfmPendingActions[interaction.customId];
            } catch (err) {
                console.error("Error handling Last.fm confirmation:", err);
                const { embed, components } = buildErrorEmbed(err.code || "005", err.err || err);
                await interaction.update({ embeds: [embed], components });
            }
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

// Message delete handler for snipe
client.on("messageDelete", async (message) => {
    if (message.partial) {
        try {
            message = await message.fetch();
        } catch (err) {
            return;
        }
    }
    if (!message.guild || message.author?.bot) return;

    const snipes = client.snipes.get(message.channel.id) || [];
    
    const snipe = {
        content: message.content,
        author: message.author,
        image: message.attachments.first()?.proxyURL || null,
        timestamp: message.createdTimestamp,
    };

    snipes.unshift(snipe); // Add to beginning
    if (snipes.length > 20) snipes.pop(); // Keep last 20

    client.snipes.set(message.channel.id, snipes);
});

// Message update handler for editsnipe
client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (oldMessage.partial) {
        try {
            oldMessage = await oldMessage.fetch();
        } catch (err) {
            return;
        }
    }
    if (!oldMessage.guild || oldMessage.author?.bot || oldMessage.content === newMessage.content) return;

    const editsnipes = client.editsnipes.get(oldMessage.channel.id) || [];
    
    const editsnipe = {
        oldContent: oldMessage.content,
        newContent: newMessage.content,
        author: oldMessage.author,
        messageId: newMessage.id,
        channelId: newMessage.channel.id,
        timestamp: newMessage.editedTimestamp || Date.now(),
    };

    editsnipes.unshift(editsnipe);
    if (editsnipes.length > 20) editsnipes.pop();

    client.editsnipes.set(oldMessage.channel.id, editsnipes);
});

// Reaction handlers for reactionsnipe
client.on("messageReactionRemove", async (reaction, user) => {
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (err) {}
    }
    if (user.partial) {
        try {
            await user.fetch();
        } catch (err) {}
    }
    if (user.bot || !reaction.message.guild) return;

    const reactionsnipes = client.reactionsnipes.get(reaction.message.channel.id) || [];
    
    const reactionsnipe = {
        user: user,
        emoji: reaction.emoji,
        messageId: reaction.message.id,
        channelId: reaction.message.channel.id,
        timestamp: Date.now(),
        action: "removed"
    };

    reactionsnipes.unshift(reactionsnipe);
    if (reactionsnipes.length > 20) reactionsnipes.pop();

    client.reactionsnipes.set(reaction.message.channel.id, reactionsnipes);
});

client.on("messageReactionAdd", async (reaction, user) => {
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (err) {}
    }
    if (user.partial) {
        try {
            await user.fetch();
        } catch (err) {}
    }
    if (user.bot || !reaction.message.guild) return;

    const reactionsnipes = client.reactionsnipes.get(reaction.message.channel.id) || [];
    
    const reactionsnipe = {
        user: user,
        emoji: reaction.emoji,
        messageId: reaction.message.id,
        channelId: reaction.message.channel.id,
        timestamp: Date.now(),
        action: "added"
    };

    reactionsnipes.unshift(reactionsnipe);
    if (reactionsnipes.length > 20) reactionsnipes.pop();

    client.reactionsnipes.set(reaction.message.channel.id, reactionsnipes);
});

// Login
startKeepAliveServer();
client.login(process.env.TOKEN);
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("rockpaperscissors")
        .setDescription("Play a game of Rock Paper Scissors!")
        .addStringOption(option =>
            option.setName("mode")
                .setDescription("Choose your opponent")
                .setRequired(true)
                .addChoices(
                    { name: "Bot", value: "bot" },
                    { name: "Human", value: "human" }
                )
        )
        .addUserOption(option =>
            option.setName("opponent")
                .setDescription("The person you want to play against (required for Human mode)")
                .setRequired(false)
        ),

    name: "rockpaperscissors",
    aliases: ["rps"],

    async executeSlash(interaction) {
        const mode = interaction.options.getString("mode");
        const opponent = interaction.options.getUser("opponent");

        if (mode === "human" && !opponent) {
            return interaction.reply({ content: "You must specify an opponent to play in Human mode!", ephemeral: true });
        }

        if (mode === "human" && opponent.id === interaction.user.id) {
            return interaction.reply({ content: "You cannot play against yourself!", ephemeral: true });
        }

        if (mode === "human" && opponent.bot) {
            return interaction.reply({ content: "Please use the 'Bot' mode to play against a bot!", ephemeral: true });
        }

        await this.startGame(interaction, interaction.user, opponent, mode === "bot");
    },

    async executePrefix(message, args) {
        let mode = "bot";
        let opponent = null;

        if (args[0]?.toLowerCase() === "human") {
            mode = "human";
            opponent = message.mentions.users.first();
            if (!opponent) {
                return message.reply("You must mention an opponent to play in Human mode! Usage: `!rps human @user` or `!rps bot`.");
            }
            if (opponent.id === message.author.id) {
                return message.reply("You cannot play against yourself!");
            }
            if (opponent.bot) {
                return message.reply("Please use the 'bot' mode to play against a bot!");
            }
        } else if (args[0]?.toLowerCase() === "bot") {
            mode = "bot";
        }

        await this.startGame(message, message.author, opponent, mode === "bot");
    },

    async startGame(context, player1, player2, isBot) {
        const choices = {
            [player1.id]: null,
            [isBot ? "bot" : player2.id]: null
        };

        const emojis = {
            rock: "🪨",
            paper: "📄",
            scissors: "✂️"
        };

        const getEmbed = (status) => {
            const embed = new EmbedBuilder()
                .setTitle("Rock Paper Scissors")
                .setColor("#000000")
                .setDescription(status || (isBot ? "Choose your weapon!" : `${player1} and ${player2}, choose your weapons!`))
                .setFooter({ text: isBot ? "Mode: Human vs Bot" : `Mode: Human vs Human (${player2.username})` });

            if (!isBot) {
                const p1Status = choices[player1.id] ? "✅ Chosen" : "⏳ Thinking...";
                const p2Status = choices[player2.id] ? "✅ Chosen" : "⏳ Thinking...";
                embed.addFields(
                    { name: player1.username, value: p1Status, inline: true },
                    { name: player2.username, value: p2Status, inline: true }
                );
            }

            return embed;
        };

        const getButtons = (disabled = false) => {
            return [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("rps_rock").setLabel("Rock").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
                    new ButtonBuilder().setCustomId("rps_paper").setLabel("Paper").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
                    new ButtonBuilder().setCustomId("rps_scissors").setLabel("Scissors").setStyle(ButtonStyle.Secondary).setDisabled(disabled)
                )
            ];
        };

        const response = context.deferred || context.replied
            ? await context.editReply({ embeds: [getEmbed()], components: getButtons() })
            : await context.reply({ embeds: [getEmbed()], components: getButtons() });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 600000 // 10 minutes
        });

        collector.on("collect", async (i) => {
            const p2Id = isBot ? "bot" : player2.id;
            if (i.user.id !== player1.id && i.user.id !== p2Id) {
                return i.reply({ content: "This is not your game!", ephemeral: true });
            }

            if (choices[i.user.id]) {
                return i.reply({ content: "You have already made a choice!", ephemeral: true });
            }

            const choice = i.customId.split("_")[1];
            choices[i.user.id] = choice;

            await i.reply({ content: `You selected **${choice.charAt(0).toUpperCase() + choice.slice(1)}**!`, ephemeral: true });

            if (isBot) {
                const botChoices = ["rock", "paper", "scissors"];
                choices["bot"] = botChoices[Math.floor(Math.random() * botChoices.length)];
                collector.stop("finished");
            } else if (choices[player1.id] && choices[player2.id]) {
                collector.stop("finished");
            } else {
                await (context.editReply ? context.editReply({ embeds: [getEmbed()] }) : response.edit({ embeds: [getEmbed()] }));
            }
        });

        collector.on("end", async (collected, reason) => {
            if (reason === "finished") {
                const p1Choice = choices[player1.id];
                const p2Choice = isBot ? choices["bot"] : choices[player2.id];

                let result;
                if (p1Choice === p2Choice) {
                    result = "It's a draw!";
                } else if (
                    (p1Choice === "rock" && p2Choice === "scissors") ||
                    (p1Choice === "paper" && p2Choice === "rock") ||
                    (p1Choice === "scissors" && p2Choice === "paper")
                ) {
                    result = `${player1.username} wins!`;
                } else {
                    result = isBot ? "Bot wins!" : `${player2.username} wins!`;
                }

                const finalStatus = `# ${result}\n\n` +
                    `**${player1.username}** chose ${p1Choice}\n` +
                    `**${isBot ? "Bot" : player2.username}** chose ${p2Choice}`;

                const finalEmbed = new EmbedBuilder()
                    .setTitle("Rock Paper Scissors - Result")
                    .setColor("#000000")
                    .setDescription(finalStatus)
                    .setFooter({ text: "Game Over" });

                if (context.editReply) {
                    await context.editReply({ embeds: [finalEmbed], components: getButtons(true) });
                } else {
                    await response.edit({ embeds: [finalEmbed], components: getButtons(true) });
                }
            } else if (reason === "time") {
                const timeoutText = "Game timed out.";
                if (context.editReply) {
                    await context.editReply({ content: timeoutText, embeds: [], components: getButtons(true) });
                } else {
                    await response.edit({ content: timeoutText, embeds: [], components: getButtons(true) });
                }
            }
        });
    }
};

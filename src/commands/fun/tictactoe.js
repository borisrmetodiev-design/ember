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
        .setName("tictactoe")
        .setDescription("Play a game of Tic Tac Toe!")
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

    name: "tictactoe",
    aliases: ["ttt"],

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
                return message.reply("You must mention an opponent to play in Human mode! Usage: `!tictactoe human @user` or `!tictactoe bot`.");
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
        const board = Array(9).fill(null);
        let currentPlayer = player1;
        const xEmoji = "❌";
        const oEmoji = "⭕";
        const emptyEmoji = "➖";

        const getEmbed = (status) => {
            return new EmbedBuilder()
                .setTitle("Tic Tac Toe")
                .setDescription(status || `${currentPlayer}'s turn (${currentPlayer.id === player1.id ? xEmoji : oEmoji})`)
                .setColor("#000000")
                .setFooter({ text: isBot ? "Mode: Human vs Bot" : `Mode: Human vs Human (${player2.username})` });
        };

        const getButtons = (disabled = false) => {
            const rows = [];
            for (let i = 0; i < 3; i++) {
                const row = new ActionRowBuilder();
                for (let j = 0; j < 3; j++) {
                    const index = i * 3 + j;
                    const cell = board[index];
                    const button = new ButtonBuilder()
                        .setCustomId(`ttt_${index}`)
                        .setEmoji(cell === "X" ? xEmoji : cell === "O" ? oEmoji : emptyEmoji)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(disabled);
                    row.addComponents(button);
                }
                rows.push(row);
            }
            return rows;
        };

        const checkWinner = (b) => {
            const winPaths = [
                [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
                [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
                [0, 4, 8], [2, 4, 6]             // Diagonals
            ];
            for (const path of winPaths) {
                if (b[path[0]] && b[path[0]] === b[path[1]] && b[path[0]] === b[path[2]]) {
                    return b[path[0]];
                }
            }
            if (b.every(cell => cell !== null)) return "draw";
            return null;
        };

        // Minimax for smart bot
        const minimax = (newBoard, player) => {
            const availSpots = newBoard.map((v, i) => v === null ? i : null).filter(v => v !== null);
            const winner = checkWinner(newBoard);

            if (winner === "X") return { score: -10 };
            if (winner === "O") return { score: 10 };
            if (winner === "draw") return { score: 0 };

            const moves = [];
            for (let i = 0; i < availSpots.length; i++) {
                const move = {};
                move.index = availSpots[i];
                newBoard[availSpots[i]] = player;

                if (player === "O") {
                    const result = minimax(newBoard, "X");
                    move.score = result.score;
                } else {
                    const result = minimax(newBoard, "O");
                    move.score = result.score;
                }

                newBoard[availSpots[i]] = null;
                moves.push(move);
            }

            let bestMove;
            if (player === "O") {
                let bestScore = -Infinity;
                for (let i = 0; i < moves.length; i++) {
                    if (moves[i].score > bestScore) {
                        bestScore = moves[i].score;
                        bestMove = i;
                    }
                }
            } else {
                let bestScore = Infinity;
                for (let i = 0; i < moves.length; i++) {
                    if (moves[i].score < bestScore) {
                        bestScore = moves[i].score;
                        bestMove = i;
                    }
                }
            }
            return moves[bestMove];
        };

        const response = context.deferred || context.replied
            ? await context.editReply({ embeds: [getEmbed()], components: getButtons() })
            : await context.reply({ embeds: [getEmbed()], components: getButtons() });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 600000 // 10 minutes
        });

        collector.on("collect", async (i) => {
            if (i.user.id !== currentPlayer.id) {
                return i.reply({ content: "It's not your turn!", ephemeral: true });
            }

            const index = parseInt(i.customId.split("_")[1]);
            if (board[index] !== null) {
                return i.reply({ content: "That spot is already taken!", ephemeral: true });
            }

            board[index] = currentPlayer.id === player1.id ? "X" : "O";

            let winner = checkWinner(board);
            if (winner) {
                collector.stop(winner);
                const status = winner === "draw" ? "It's a draw!" : `${currentPlayer} wins!`;
                await i.update({ embeds: [getEmbed(status)], components: getButtons(true) });
                return;
            }

            // Switch turn
            currentPlayer = currentPlayer.id === player1.id ? (isBot ? { id: "bot", username: "Bot" } : player2) : player1;

            if (isBot && currentPlayer.id === "bot") {
                await i.update({ embeds: [getEmbed("Bot is thinking...")], components: getButtons(true) });
                
                // Bot move
                const botMove = minimax(board, "O");
                board[botMove.index] = "O";

                winner = checkWinner(board);
                if (winner) {
                    collector.stop(winner);
                    const status = winner === "draw" ? "It's a draw!" : "Bot wins!";
                    if (context.editReply) {
                        await context.editReply({ embeds: [getEmbed(status)], components: getButtons(true) });
                    } else {
                        await response.edit({ embeds: [getEmbed(status)], components: getButtons(true) });
                    }
                } else {
                    currentPlayer = player1;
                    if (context.editReply) {
                        await context.editReply({ embeds: [getEmbed()], components: getButtons() });
                    } else {
                        await response.edit({ embeds: [getEmbed()], components: getButtons() });
                    }
                }
            } else {
                await i.update({ embeds: [getEmbed()], components: getButtons() });
            }
        });

        collector.on("end", async (collected, reason) => {
            if (reason === "time") {
                if (context.editReply) {
                    await context.editReply({ content: "Game timed out.", embeds: [], components: getButtons(true) });
                } else {
                    await response.edit({ content: "Game timed out.", embeds: [], components: getButtons(true) });
                }
            }
        });
    }
};

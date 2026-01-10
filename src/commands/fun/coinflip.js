const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName("coinflip")
            .setDescription("Flip a coin!")
            .addBooleanOption(option =>
                option.setName("ephemeral")
                    .setDescription("Whether the result should be visible only to you")
                    .setRequired(false)
            ),
        
        name: "coinflip",
        aliases: ["cf"],

        async executeSlash(interaction) {
            const ephemeral = interaction.options.getBoolean("ephemeral") || false;
            await this.handleFlip(interaction, null, ephemeral);
        },

        async executePrefix(message, args, client) {
            await this.handleFlip(message, null, false);
        },

        async handleFlip(context, choice, ephemeral) {
            const isSlash = context.isChatInputCommand?.();
            const loadingEmoji = process.env.emberLOAD;
            
            const initialEmbed = new EmbedBuilder()
                .setColor("#000000")
                .setDescription(`${loadingEmoji} Flipping the coin...`);

            let response;
            if (isSlash) {
                response = await context.reply({ embeds: [initialEmbed], ephemeral, fetchReply: true });
            } else {
                response = await context.reply({ embeds: [initialEmbed] });
            }

            // "Animation" - 2 seconds delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            const result = Math.random() < 0.5 ? "Heads" : "Tails";

            const thumbnails = {
                "Heads": process.env.emberHEADS,
                "Tails": process.env.emberTAILS
            };

            const resultEmbed = new EmbedBuilder()
                .setColor("#000000")
                .setTitle(`Coinflip Result`)
                .setDescription(`The coin landed on **${result}**! ${thumbnails[result] || ""}`)
                .setTimestamp();

            if (choice) {
                const won = choice.toLowerCase() === result.toLowerCase();
                if (won) {
                    resultEmbed.setDescription(`The coin landed on **${result}**! ${thumbnails[result] || ""}\n\nYou won!`);
                    resultEmbed.setColor("#00FF00");
                } else {
                    resultEmbed.setDescription(`The coin landed on **${result}**! ${thumbnails[result] || ""}\n\nYou lost.`);
                    resultEmbed.setColor("#FF0000");
                }
            }

            if (isSlash) {
                await context.editReply({ embeds: [resultEmbed] });
            } else {
                await response.edit({ embeds: [resultEmbed] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName("coinflipchoose")
            .setDescription("Flip a coin and bet on an outcome!")
            .addStringOption(option =>
                option.setName("option")
                    .setDescription("Heads or Tails")
                    .setRequired(true)
                    .addChoices(
                        { name: "Heads", value: "Heads" },
                        { name: "Tails", value: "Tails" }
                    )
            )
            .addBooleanOption(option =>
                option.setName("ephemeral")
                    .setDescription("Whether the result should be visible only to you")
                    .setRequired(false)
            ),
        
        name: "coinflipchoose",
        aliases: ["cfc", "choose"],

        async executeSlash(interaction) {
            const choice = interaction.options.getString("option");
            const ephemeral = interaction.options.getBoolean("ephemeral") || false;
            // Use the handleFlip from the first command object (or we can move it to a shared utility if preferred)
            await module.exports[0].handleFlip(interaction, choice, ephemeral);
        },

        async executePrefix(message, args, client) {
            const choice = args[0];
            if (!choice || !["heads", "tails"].includes(choice.toLowerCase())) {
                const embed = new EmbedBuilder()
                    .setColor("#FF0000")
                    .setTitle(`${process.env.emberERROR} Invalid Choice`)
                    .setDescription("Please specify either `heads` or `tails`.\nExample: `\\coinflipchoose heads`.");
                return message.reply({ embeds: [embed] });
            }
            await module.exports[0].handleFlip(message, choice, false);
        }
    }
];

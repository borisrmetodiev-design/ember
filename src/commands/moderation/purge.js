const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits, 
    ChannelType,
    ComponentType
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("purge")
        .setDescription("Delete messages from the channel or a specific user")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(option =>
            option.setName("count")
                .setDescription("Number of messages to delete")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        )
        .addUserOption(option =>
            option.setName("user")
                .setDescription("User whose messages should be deleted")
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName("scope")
                .setDescription("Scope of the purge")
                .setRequired(false)
                .addChoices(
                    { name: "Current Channel", value: "channel" },
                    { name: "Global Total (-a flag)", value: "global_total" },
                    { name: "Global Each Channel (-aa flag)", value: "global_each" }
                )
        ),

    name: "purge",
    aliases: ["clear", "prune"],

    async executeSlash(interaction) {
        if (!interaction.guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        
        const count = interaction.options.getInteger("count");
        const user = interaction.options.getUser("user");
        const scopeChoice = interaction.options.getString("scope") || "channel";
        
        let scope = "channel";
        if (scopeChoice === "global_total") scope = "-a";
        else if (scopeChoice === "global_each") scope = "-aa";

        await this.handlePurge(interaction, count, user, scope);
    },

    async executePrefix(message, args, client) {
        if (!message.guild) return message.reply("This command can only be used in a server.");
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("You need Administrator permissions to use this command.");
        }

        if (args.length === 0) {
            return message.reply("Usage: `\\purge [count] [@user (o)] [-a/-aa (o)]`?");
        }

        const count = parseInt(args[0]);
        if (isNaN(count) || count < 1) return message.reply("Please provide a valid number of messages to purge.");

        let user = null;
        let scope = "channel";

        // Logic to extract user and scope from args
        for (let i = 1; i < args.length; i++) {
            const arg = args[i].toLowerCase();
            if (arg === "-a") scope = "-a";
            else if (arg === "-aa") scope = "-aa";
            else if (message.mentions.users.size > 0 && arg.includes(message.mentions.users.first().id)) {
                user = message.mentions.users.first();
            } else if (/^\d+/.test(arg)) {
                try {
                    user = await client.users.fetch(arg).catch(() => null);
                } catch {}
            }
        }

        await this.handlePurge(message, count, user, scope);
    },

    async handlePurge(context, count, user, scope) {
        const isSlash = !!context.isChatInputCommand;
        const initiator = isSlash ? context.user : context.author;
        
        // Validation: Global purge requires a user as per request
        if ((scope === "-a" || scope === "-aa") && !user) {
            return context.reply({ content: "Global purge (-a/-aa) requires a specified user.", ephemeral: isSlash });
        }

        let description = `Are you sure you want to delete **${count}** messages`;
        if (user) description += ` by **${user.tag}**`;
        
        if (scope === "-a") description += ` total across **all channels**?`;
        else if (scope === "-aa") description += ` in **each channel** (up to ${count} each)?`;
        else description += ` in **this channel**?`;

        const embed = new EmbedBuilder()
            .setTitle(`${process.env.lumenWARN || "⚠️"} Confirm Purge`)
            .setDescription(description)
            .setColor("#ffcc00")
            .setFooter({ text: "This action cannot be undone." });

        const confirmId = `confirm_purge_${Date.now()}`;
        const cancelId = `cancel_purge_${Date.now()}`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(confirmId).setLabel("Confirm").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(cancelId).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        );

        const replyOptions = {
            embeds: [embed],
            components: [row],
            fetchReply: true
        };

        const response = await context.reply(replyOptions);
        const responseId = response.id;

        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === initiator.id,
            componentType: ComponentType.Button,
            time: 30000
        });

        collector.on("collect", async i => {
            if (i.customId === confirmId) {
                const purgingEmbed = new EmbedBuilder()
                    .setDescription(`${process.env.lumenLOAD || "⏳"} Purging messages... (This may take a moment)`)
                    .setColor("#0099FF");
                
                await i.update({ embeds: [purgingEmbed], components: [] });
                await this.performPurge(context, count, user, scope, i, responseId);
            } else {
                await i.update({ content: "Purge cancelled.", embeds: [], components: [] });
                setTimeout(() => {
                    if (isSlash) context.deleteReply().catch(() => null);
                    else response.delete().catch(() => null);
                    
                    if (!isSlash) context.delete().catch(() => null);
                }, 3000);
            }
            collector.stop();
        });

        collector.on("end", (collected, reason) => {
            if (reason === "time") {
                const timeoutEmbed = new EmbedBuilder()
                    .setDescription("Purge confirmation timed out.")
                    .setColor("#ff0000");
                if (isSlash) {
                    context.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => null);
                    setTimeout(() => context.deleteReply().catch(() => null), 3000);
                } else {
                    response.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => null);
                    setTimeout(() => {
                        response.delete().catch(() => null);
                        context.delete().catch(() => null);
                    }, 3000);
                }
            }
        });
    },

    async performPurge(context, count, user, scope, interaction, responseId) {
        const guild = context.guild;
        const currentChannel = context.channel;
        const triggerMessageId = context.id; // interaction.id for slash, message.id for prefix
        let deletedTotal = 0;

        try {
            if (scope === "channel") {
                // Fetch more than count to account for filtering out trigger and response messages
                const fetched = await currentChannel.messages.fetch({ limit: Math.min(count + 5, 100) });
                
                let toDelete = fetched.filter(m => {
                    // Exclude the purge command trigger message and the confirmation response message
                    if (m.id === triggerMessageId || m.id === responseId) return false;
                    
                    if (user) return m.author.id === user.id;
                    return true;
                });

                // Take exactly 'count' messages
                const finalToDelete = toDelete.first(count);
                
                const deleted = await currentChannel.bulkDelete(finalToDelete, true);
                deletedTotal = deleted.size;
            } 
            else if (scope === "-aa") {
                const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
                for (const [id, channel] of channels) {
                    try {
                        const fetched = await channel.messages.fetch({ limit: 100 });
                        const userMessages = fetched.filter(m => {
                            if (m.id === triggerMessageId || m.id === responseId) return false;
                            return m.author.id === user.id;
                        }).first(count);

                        if (userMessages.length > 0) {
                            const del = await channel.bulkDelete(userMessages, true);
                            deletedTotal += del.size;
                        }
                    } catch (err) {
                        console.warn(`Purge skipped in channel ${id}: ${err.message}`);
                    }
                }
            }
            else if (scope === "-a") {
                const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
                let allUserMessages = [];
                
                for (const [id, channel] of channels) {
                    try {
                        const fetched = await channel.messages.fetch({ limit: 100 });
                        const userMessages = fetched.filter(m => {
                            if (m.id === triggerMessageId || m.id === responseId) return false;
                            return m.author.id === user.id;
                        });
                        userMessages.forEach(m => allUserMessages.push(m));
                    } catch (err) {
                        console.warn(`Fetch skipped in channel ${id}: ${err.message}`);
                    }
                }

                allUserMessages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                const toDelete = allUserMessages.slice(0, count);

                const byChannel = {};
                toDelete.forEach(m => {
                    if (!byChannel[m.channelId]) byChannel[m.channelId] = [];
                    byChannel[m.channelId].push(m);
                });

                for (const channelId in byChannel) {
                    const channel = guild.channels.cache.get(channelId);
                    if (channel) {
                        try {
                            const del = await channel.bulkDelete(byChannel[channelId], true);
                            deletedTotal += del.size;
                        } catch (err) {
                            console.warn(`BulkDelete failed in channel ${channelId}: ${err.message}`);
                        }
                    }
                }
            }

            const successEmbed = new EmbedBuilder()
                .setDescription(`Successfully purged **${deletedTotal}** messages.`)
                .setColor("#00FF00");

            await interaction.editReply({ embeds: [successEmbed] });

            const isSlash = !!context.isChatInputCommand;
            setTimeout(() => {
                interaction.deleteReply().catch(() => null);
                if (!isSlash) context.delete().catch(() => null);
            }, 3000);

        } catch (err) {
            console.error("Purge Execution Error:", err);
            const errorEmbed = new EmbedBuilder()
                .setDescription("An error occurred while purging messages. Check bot logs.")
                .setColor("#FF0000");
            await interaction.editReply({ embeds: [errorEmbed] }).catch(() => null);
            
            const isSlash = !!context.isChatInputCommand;
            setTimeout(() => {
                interaction.deleteReply().catch(() => null);
                if (!isSlash) context.delete().catch(() => null);
            }, 3000);
        }
    }
};

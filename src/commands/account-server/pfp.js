const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

const pfpData = {
    name: "pfp",
    description: "Get the profile picture of a user",
    aliases: ["avatar", "profilepic"],
    async execute(target, isSlash, interactionOrMessage, options = {}) {
        const { ephemeral = false, server = false } = options;
        const guild = isSlash ? interactionOrMessage.guild : interactionOrMessage.guild;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;

        try {
            let avatarUrl;
            if (server && guild) {
                // Add a timeout to member fetch to prevent hanging in large guilds
                const member = await Promise.race([
                    guild.members.fetch(target.id),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Member fetch timeout")), 10000))
                ]).catch(err => {
                    console.warn(`[DEBUG] Member fetch failed for ${target.id}: ${err.message}`);
                    return null; // Fallback to global user avatar
                });

                avatarUrl = member?.avatar
                    ? member.displayAvatarURL({ size: 4096, dynamic: true })
                    : target.displayAvatarURL({ size: 4096, dynamic: true });
            } else {
                avatarUrl = target.displayAvatarURL({ size: 4096, dynamic: true });
            }

            if (!avatarUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({
                    name: `${target.username}'s Avatar`,
                    iconURL: target.displayAvatarURL({ dynamic: true })
                })
                .setImage(avatarUrl)
                .setTimestamp();

            if (isSlash) {
                try {
                    await interactionOrMessage.reply({ 
                        embeds: [embed], 
                        flags: ephemeral ? MessageFlags.Ephemeral : undefined
                    });
                } catch (err) {
                     if (err.code === 10062) {
                        console.warn("[WARN] Interaction timed out during reply in pfp/avatar.");
                        return;
                    }
                    throw err;
                }
            } else {
                await interactionOrMessage.reply({ embeds: [embed] });
            }
        } catch (err) {
            throw err.code ? err : { code: "004", err };
        }
    }
};

const commonOptions = (builder) => builder
    .addUserOption(option =>
        option.setName("user")
            .setDescription("The user to get the profile picture of")
            .setRequired(false)
    )
    .addBooleanOption(option =>
        option.setName("ephemeral")
            .setDescription("Send the avatar as ephemeral")
            .setRequired(false)
    )
    .addBooleanOption(option =>
        option.setName("server")
            .setDescription("Show the server avatar if available")
            .setRequired(false)
    );

module.exports = [
    {
        data: commonOptions(new SlashCommandBuilder().setName("pfp").setDescription("Get the profile picture of a user")),
        name: "pfp",  
        aliases: ["avatar", "profilepic"],
        async executeSlash(interaction) {
            const targetUser = interaction.options.getUser("user") || interaction.user;
            const ephemeral = interaction.options.getBoolean("ephemeral") || false;
            const server = interaction.options.getBoolean("server") || false;
            await pfpData.execute(targetUser, true, interaction, { ephemeral, server });
        },
        async executePrefix(message, args) {
            let targetUser;
            if (message.mentions.users.size > 0) {
                targetUser = message.mentions.users.first();
            } else if (args[0] && /^\d+$/.test(args[0])) {
                try {
                    targetUser = await message.client.users.fetch(args[0]);
                } catch {
                    throw { code: "002" };
                }
            } else {
                targetUser = message.author;
            }
            const server = args.includes("--server");
            await pfpData.execute(targetUser, false, message, { server });
        }
    },   
    {
        data: commonOptions(new SlashCommandBuilder().setName("avatar").setDescription("Get the profile picture of a user")),
        name: "avatar",
        aliases: ["pfp", "profilepic"],
        async executeSlash(interaction) {
            const targetUser = interaction.options.getUser("user") || interaction.user;
            const ephemeral = interaction.options.getBoolean("ephemeral") || false;
            const server = interaction.options.getBoolean("server") || false;
            await pfpData.execute(targetUser, true, interaction, { ephemeral, server });
        },
        async executePrefix(message, args) {
            let targetUser;
            if (message.mentions.users.size > 0) {
                targetUser = message.mentions.users.first();
            } else if (args[0] && /^\d+$/.test(args[0])) {
                try {
                    targetUser = await message.client.users.fetch(args[0]);
                } catch {
                    throw { code: "002" };
                }
            } else {
                targetUser = message.author;
            }
            const server = args.includes("--server");
            await pfpData.execute(targetUser, false, message, { server });
        }
    }
];

const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName("groupicon")
            .setDescription("Get the icon of the current Group DM"),
        name: "groupicon",
        async executeSlash(interaction) {
            await handleGroupIcon(interaction);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName("groupfp")
            .setDescription("Get the icon of the current Group DM"),
        name: "groupfp",
        async executeSlash(interaction) {
            await handleGroupIcon(interaction);
        }
    }
];

async function handleGroupIcon(interaction) {
    // Check if the channel is a Group DM
    // Note: Bots usually cannot see Group DMs unless specifically permitted/legacy
    // or if the interaction carries the channel context.
    const channel = interaction.channel;

    if (!channel || channel.type !== ChannelType.GroupDM) {
        return interaction.reply({ 
            content: "This command can only be used inside a **Group DM** (GC).", 
            ephemeral: true 
        });
    }

    const iconUrl = channel.iconURL({ dynamic: true, size: 1024 });

    if (!iconUrl) {
        return interaction.reply({ 
            content: "This Group DM does not have a custom icon set.", 
            ephemeral: true 
        });
    }

    const embed = new EmbedBuilder()
        .setColor("#ff6600")
        .setAuthor({ name: `${channel.name || "Group DM"}` })
        .setTitle("Group Icon")
        .setImage(iconUrl)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

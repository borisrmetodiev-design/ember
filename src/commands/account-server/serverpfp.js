const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const serverPfpData = {
    async execute(guild, isSlash, interactionOrMessage, options = {}) {
        const { spoiler = false, ephemeral = false } = options;
        try {
            const iconUrl = guild.iconURL({ size: 4096, dynamic: true });
            if (!iconUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({ name: `${guild.name}'s Icon` })
                .setImage(spoiler ? `||${iconUrl}||` : iconUrl)
                .setTimestamp();

            if (isSlash) {
                await interactionOrMessage.reply({ embeds: [embed], ephemeral });
            } else {
                await interactionOrMessage.reply({ embeds: [embed] });
            }
        } catch (err) {
            throw err.code ? err : { code: "004", err };
        }
    }
};

const commonOptions = (builder) => builder
    .addBooleanOption(option =>
        option.setName("ephemeral").setDescription("Send the server icon as ephemeral").setRequired(false)
    )
    .addBooleanOption(option =>
        option.setName("spoiler").setDescription("Send the server icon as a spoiler").setRequired(false)
    );

const commandNames = ["guildicon", "guildpfp", "servericon", "serverpfp", "serveravatar", "guildavatar"];

module.exports = commandNames.map(name => ({
    data: commonOptions(new SlashCommandBuilder().setName(name).setDescription(`Get the server's profile picture (${name})`)),
    name: name,
    aliases: commandNames.filter(n => n !== name),
    async executeSlash(interaction) {
        const ephemeral = interaction.options.getBoolean("ephemeral") || false;
        const spoiler = interaction.options.getBoolean("spoiler") || false;
        await serverPfpData.execute(interaction.guild, true, interaction, { ephemeral, spoiler });
    },
    async executePrefix(message, args) {
        const spoiler = args.includes("--spoiler");
        let guild;
        if (args[0] && /^\d+$/.test(args[0])) {
            guild = await message.client.guilds.fetch(args[0]).catch(() => { throw { code: "001" }; });
        } else {
            guild = message.guild;
        }
        if (!guild) throw { code: "002" };
        await serverPfpData.execute(guild, false, message, { spoiler });
    }
}));

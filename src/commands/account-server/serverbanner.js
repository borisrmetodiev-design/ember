const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const serverBannerData = {
    async execute(guild, isSlash, interactionOrMessage, options = {}) {
        const { ephemeral = false } = options;
        try {
            const bannerUrl = guild.bannerURL({ size: 4096, dynamic: true });
            if (!bannerUrl) throw { code: "003" };

            const embed = new EmbedBuilder()
                .setColor("#ff6600")
                .setAuthor({ name: `${guild.name}'s Banner` })
                .setImage(bannerUrl)
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
        option.setName("ephemeral").setDescription("Send the server banner as ephemeral").setRequired(false)
    );

const commandNames = ["guildbanner", "serverbanner"];

module.exports = commandNames.map(name => ({
    data: commonOptions(new SlashCommandBuilder().setName(name).setDescription(`Get the server's banner (${name})`)),
    name: name,
    aliases: commandNames.filter(n => n !== name),
    async executeSlash(interaction) {
        const ephemeral = interaction.options.getBoolean("ephemeral") || false;
        await serverBannerData.execute(interaction.guild, true, interaction, { ephemeral });
    },
    async executePrefix(message, args) {
        let guild;
        if (args[0] && /^\d+$/.test(args[0])) {
            guild = await message.client.guilds.fetch(args[0]).catch(() => { throw { code: "001" }; });
        } else {
            guild = message.guild;
        }
        if (!guild) throw { code: "002" };
        await serverBannerData.execute(guild, false, message, {});
    }
}));

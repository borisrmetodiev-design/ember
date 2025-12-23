const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");

function loadDB() {
    if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(path.dirname(dataPath), { recursive: true });
        fs.writeFileSync(dataPath, JSON.stringify({ users: {} }, null, 4));
    }
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function saveDB(db) {
    fs.writeFileSync(dataPath, JSON.stringify(db, null, 4));
}

module.exports = {
    // Slash command
    data: new SlashCommandBuilder()
        .setName("lastfmsetup")
        .setDescription("Link your Last.fm account to Ember")
        .addStringOption(option =>
            option
                .setName("username")
                .setDescription("Your Last.fm username")
                .setRequired(true)
        ),

    // Prefix command
    name: "lastfmsetup",
    aliases: ["lfmsetup", "lfm", "lastfm"],

    async executeSlash(interaction) {
        const username = interaction.options.getString("username");
        const userId = interaction.user.id;

        const db = loadDB();
        db.users[userId] = username;
        saveDB(db);

        const embed = new EmbedBuilder()
            .setColor("#ff6600")
            .setTitle("Last.fm Account Linked")
            .setDescription(
                `Your Last.fm account has been linked successfully!\n\n` +
                `**Username:** \`${username}\`\n` +
                `You can now use \`/np\`, \`/fm\`, or \`/nowplaying\`.`
            )
            .setFooter({ text: "Ember Status — Last.fm" })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async executePrefix(message, args) {
        const username = args[0];
        const userId = message.author.id;

        if (!username) {
            return message.reply("Please provide your Last.fm username.");
        }

        const db = loadDB();
        db.users[userId] = username;
        saveDB(db);

        const embed = new EmbedBuilder()
            .setColor("#ff6600")
            .setTitle("Last.fm Account Linked")
            .setDescription(
                `Your Last.fm account has been linked successfully!\n\n` +
                `**Username:** \`${username}\`\n` +
                `You can now use \`\\np\`, \`\\fm\`, or \`\\nowplaying\`.`
            )
            .setFooter({ text: "Ember Status — Last.fm" })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};
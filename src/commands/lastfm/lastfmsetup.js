const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../../storage/data/lastFMusers.json");

function loadDB() {
    try {
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(path.dirname(dataPath), { recursive: true });
            fs.writeFileSync(dataPath, JSON.stringify({ users: {} }, null, 4));
        }
        return JSON.parse(fs.readFileSync(dataPath, "utf8"));
    } catch (err) {
        throw { code: "005", err }; // LastFM data fetch failed (local DB read error)
    }
}

function saveDB(db) {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(db, null, 4));
    } catch (err) {
        throw { code: "005", err }; // LastFM data fetch failed (local DB write error)
    }
}

// Optional: placeholder for Last.fm API validation
async function validateLastFMUser(username) {
    // Example: call Last.fm API here
    // If API key invalid → throw { code: "006" }
    // If username invalid → throw { code: "019" }
    return true; // stub
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("lastfmsetup")
        .setDescription("Link your Last.fm account to Ember")
        .addStringOption(option =>
            option
                .setName("username")
                .setDescription("Your Last.fm username")
                .setRequired(true)
        ),

    name: "lastfmsetup",
    aliases: ["lfmsetup", "lfm", "lastfm"],

    async executeSlash(interaction) {
        try {
            const username = interaction.options.getString("username");
            const userId = interaction.user.id;

            if (!username) throw { code: "004" }; // Missing required arguments

            // Validate username via API (future-proof)
            const valid = await validateLastFMUser(username);
            if (!valid) throw { code: "019" }; // Invalid LastFM user inputted

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
        } catch (err) {
            throw err.code ? err : { code: "005", err }; // fallback to LastFM data fetch failed
        }
    },

    async executePrefix(message, args) {
        try {
            const username = args[0];
            const userId = message.author.id;

            if (!username) throw { code: "004" }; // Missing required arguments

            // Validate username via API (future-proof)
            const valid = await validateLastFMUser(username);
            if (!valid) throw { code: "019" }; // Invalid LastFM user inputted

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
        } catch (err) {
            throw err.code ? err : { code: "005", err }; // fallback to LastFM data fetch failed
        }
    }
};
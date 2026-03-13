const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const moment = require("moment-timezone");
const ct = require("countries-and-timezones");
const timezoneService = require("../../services/timezoneService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("tz")
        .setDescription("Timezone commands")
        .addSubcommand(sub =>
            sub.setName("set")
                .setDescription("Set your timezone based on a city or country")
                .addStringOption(option =>
                    option.setName("query")
                        .setDescription("City or country name (e.g. London, United Kingdom, New York)")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("view")
                .setDescription("View your own or someone else's timezone, or a specific city's time")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The user to view (leave empty for yourself)")
                )
                .addStringOption(option =>
                    option.setName("query")
                        .setDescription("A city or country to view directly (e.g. London, Tokyo)")
                )
        ),

    name: "tz",
    aliases: ["timezone"],

    async executePrefix(message, args, client) {
        if (!args[0]) {
            return message.reply("Usage: `\\tz set [city/country]` or `\\tz view [@user/city]`");
        }

        const sub = args[0].toLowerCase();
        if (sub === "set") {
            const query = args.slice(1).join(" ");
            if (!query) return message.reply("Please specify a city or country. Example: `\\tz set London` or `\\tz set United Kingdom`.");
            return this.handleSet(message, query, message.author);
        } else if (sub === "view") {
            const mention = message.mentions.users.first();
            const query = args.slice(1).join(" ");
            
            if (mention) {
                return this.handleView(message, mention);
            } else if (query) {
                // If it looks like a user ID (e.g. 18 chars), try to fetch.
                // But simpler to just check if query is a string.
                return this.handleView(message, null, query);
            } else {
                return this.handleView(message, message.author);
            }
        } else {
            return message.reply("Invalid subcommand. Use `set` or `view`.");
        }
    },

    async executeSlash(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === "set") {
            const query = interaction.options.getString("query");
            return this.handleSet(interaction, query, interaction.user);
        } else if (sub === "view") {
            const targetUser = interaction.options.getUser("user");
            const query = interaction.options.getString("query");
            return this.handleView(interaction, targetUser || (query ? null : interaction.user), query);
        }
    },

    async handleSet(context, query, user) {
        const isInteraction = !!context.interaction;
        const reply = (content) => context.reply(content);

        try {
            const result = await this.searchGlobalTimezone(query);

            if (result.success) {
                const tz = result.timezone;
                timezoneService.setUserTimezone(user.id, tz);
                
                const embed = new EmbedBuilder()
                    .setColor("#00ff00")
                    .setTitle("Timezone Set!")
                    .setDescription(`Your timezone has been set to **${tz}**.\nLocation: **${result.locationName}**\nCurrent time: **${moment().tz(tz).format("HH:mm (z)")}**`)
                    .setTimestamp();
                return reply({ embeds: [embed] });
            } else {
                return reply(`Could not find a timezone for "${query}". Try searching for your closest major city.`);
            }
        } catch (err) {
            console.error("Timezone search error:", err);
            return reply("An error occurred while searching for your timezone. Please try again later.");
        }
    },

    async handleView(context, targetUser, query) {
        const reply = (content) => context.reply(content);

        if (query) {
            try {
                const result = await this.searchGlobalTimezone(query);
                if (result.success) {
                    return this.sendTimeEmbed(context, result.timezone, null, result.locationName);
                }
                return reply(`Could not find a timezone for "${query}".`);
            } catch (err) {
                console.error("Timezone view error:", err);
                return reply("An error occurred while searching for that location.");
            }
        }

        if (targetUser) {
            const tz = timezoneService.getUserTimezone(targetUser.id);
            if (!tz) {
                const isSelf = (context.user || context.author).id === targetUser.id;
                const embed = new EmbedBuilder()
                    .setColor("#ff4444")
                    .setTitle(`${process.env.lumenERROR} Timezone Not Set`)
                    .setDescription(isSelf 
                        ? "You haven't set your timezone yet! Use `\\tz set [city]` to set it." 
                        : `${targetUser.username} hasn't set their timezone yet.`)
                    .setTimestamp();
                return reply({ embeds: [embed] });
            }
            return this.sendTimeEmbed(context, tz, targetUser);
        }
    },

    async searchGlobalTimezone(query) {
        try {
            // 1. Search for city coordinates
            const searchUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();

            if (!searchData.results || searchData.results.length === 0) {
                return { success: false };
            }

            return await this.getTimezoneFromCoords(searchData.results[0]);
        } catch (err) {
            throw err;
        }
    },

    async getTimezoneFromCoords(result) {
        const { latitude, longitude, name, admin1, country } = result;
        const tzUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`;
        const tzRes = await fetch(tzUrl);
        const tzData = await tzRes.json();

        if (!tzData.timezone) {
            return { success: false };
        }

        return {
            success: true,
            timezone: tzData.timezone,
            locationName: `${name}, ${country}`
        };
    },

    sendTimeEmbed(context, tz, targetUser, queryName) {
        const reply = (content) => context.reply(content);
        const time = moment().tz(tz);
        
        const formatName = (str) => {
            if (!str) return "";
            return str
                .split(/[\/_ ]/)
                .filter(Boolean)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        };

        const displayName = queryName || formatName(tz.split('/').pop());

        const embed = new EmbedBuilder()
            .setColor("#0099ff")
            .setTitle(`Current time in ${displayName}`)
            .setDescription(`**${time.format("dddd, MMMM Do YYYY")}**\n# ${time.format("HH:mm:ss")}\nTimezone: \`${time.format("z (Z)")}\``)
            .setFooter({ text: `Offset: ${time.format("Z")} | ${tz}` })
            .setTimestamp();

        if (targetUser) {
            embed.setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL() });
            embed.setTitle(`Current time for ${targetUser.username}`);
        }

        return reply({ embeds: [embed] });
    }
};

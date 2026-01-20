const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder,
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    ComponentType, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    PermissionFlagsBits 
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "..", "..", "storage", "data", "greetchannels.json");

// Helper to read DB
function readDb() {
    try {
        if (!fs.existsSync(dbPath)) return {};
        return JSON.parse(fs.readFileSync(dbPath, "utf8"));
    } catch (e) {
        console.error("Error reading greetchannels.json", e);
        return {};
    }
}

// Helper to write DB
function writeDb(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 4));
    } catch (e) {
        console.error("Error writing greetchannels.json", e);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("greetsetup")
        .setDescription("Setup the greeting system for this server")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async executeSlash(interaction) {
        // Defer reply immediately
        try {
            await interaction.deferReply();
        } catch (err) {
            // Ignore Unknown Interaction causing potential crashes (likely timeout or race condition)
            if (err.code === 10062 || err.code === 40060) return;
            throw err;
        }

        let db = readDb();
        const guildId = interaction.guild.id;
        
        // Default config if not exists
        if (!db[guildId]) {
            db[guildId] = {
                channelId: null,
                title: "Welcome to {server}!",
                description: "Welcome {user} to {server}! You are member **#{count}**.",
                image: null,
                color: "#00FF00" 
            };
            writeDb(db);
        }

        // --- STEP 1: Select Channel ---
        
        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('greet_channel_select')
            .setPlaceholder('Select a channel for greetings')
            .setChannelTypes(ChannelType.GuildText);
            
        const btnRemove = new ButtonBuilder()
            .setCustomId('greet_remove')
            .setLabel('Remove')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!db[guildId].channelId);

        const btnNext = new ButtonBuilder()
            .setCustomId('greet_next')
            .setLabel('Next ➡')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!db[guildId].channelId);

        const btnClose = new ButtonBuilder()
            .setCustomId('greet_close')
            .setLabel('✖') 
            .setStyle(ButtonStyle.Secondary);

        const row1 = new ActionRowBuilder().addComponents(channelSelect);
        const row2 = new ActionRowBuilder().addComponents(btnRemove, btnNext, btnClose);

        const embed = new EmbedBuilder()
            .setTitle("Greet Setup")
            .setDescription(`Configure your welcome message.\n\n**Current Channel:** ${db[guildId].channelId ? `<#${db[guildId].channelId}>` : "Not set"}`)
            .setColor(0x0099FF);
        
        const response = await interaction.editReply({
            embeds: [embed],
            components: [row1, row2]
        });

        // Collector
        const collector = response.createMessageComponentCollector({ 
            filter: i => i.user.id === interaction.user.id,
            time: 300000 // 5 mins
        });

        collector.on('collect', async i => {
            if (i.customId === 'greet_close') {
                await i.message.delete().catch(() => {});
                return;
            }

            db = readDb(); // Refresh db
            let config = db[guildId];
            
            // Handle temp config if missing
            if (!config) {
                 config = {
                    channelId: null,
                    title: "Welcome to {server}!",
                    description: "Welcome {user} to {server}! You are member **#{count}**.",
                    image: null,
                    color: "#00FF00" 
                 };
            }

            if (i.customId === 'greet_channel_select') {
                const selectedChannelId = i.values[0];
                config.channelId = selectedChannelId;
                db[guildId] = config;
                writeDb(db);

                embed.setDescription(`Configure your welcome message.\n\n**Current Channel:** <#${selectedChannelId}>`);
                
                // Enable buttons
                btnRemove.setDisabled(false);
                btnNext.setDisabled(false);
                
                // Re-render
                await i.update({
                    embeds: [embed],
                    components: [row1, row2]
                });
            }
            else if (i.customId === 'greet_remove') {
                delete db[guildId];
                writeDb(db);
                
                config.channelId = null;
                
                embed.setDescription(`Configure your welcome message.\n\n**Current Channel:** Not set`);
                
                // Reset buttons
                btnRemove.setDisabled(true);
                btnNext.setDisabled(true);
                
                await i.update({
                    embeds: [embed],
                    components: [row1, row2] 
                });
            }
            else if (i.customId === 'greet_next') {
                if (!config.channelId) {
                     await i.reply({ content: "Please select a channel first!", ephemeral: true });
                     return;
                }
                await showCustomizationMenu(i, config, guildId);
            }
            else if (i.customId === 'greet_edit_msg') {
                // Show Modal for Message
                const modal = new ModalBuilder()
                    .setCustomId('greet_msg_modal')
                    .setTitle('Edit Greeting Message');

                const titleInput = new TextInputBuilder()
                    .setCustomId('greet_title_input')
                    .setLabel("Title (Variables: {server}, {user}, {count})")
                    .setStyle(TextInputStyle.Short)
                    .setValue(config.title || "Welcome to {server}!");

                const descInput = new TextInputBuilder()
                    .setCustomId('greet_desc_input')
                    .setLabel("Description")
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(config.description || "Welcome {user}!");

                const r1 = new ActionRowBuilder().addComponents(titleInput);
                const r2 = new ActionRowBuilder().addComponents(descInput);
                modal.addComponents(r1, r2);

                await i.showModal(modal);

                try {
                    const submitted = await i.awaitModalSubmit({ time: 60000, filter: m => m.user.id === interaction.user.id });
                    
                    config.title = submitted.fields.getTextInputValue('greet_title_input');
                    config.description = submitted.fields.getTextInputValue('greet_desc_input');
                    db[guildId] = config;
                    writeDb(db);

                    await showCustomizationMenu(submitted, config, guildId);
                } catch (err) {
                    console.error("Modal error", err);
                }
            }
            else if (i.customId === 'greet_edit_img') {
                 // SHow Modal for Image URL
                 const modal = new ModalBuilder()
                    .setCustomId('greet_img_modal')
                    .setTitle('Edit Greeting Image');

                const imgInput = new TextInputBuilder()
                    .setCustomId('greet_img_url')
                    .setLabel("Image URL")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder("https://example.com/image.png");
                
                // Value cannot be null
                if (config.image) imgInput.setValue(config.image);

                const r1 = new ActionRowBuilder().addComponents(imgInput);
                modal.addComponents(r1);

                await i.showModal(modal);

                try {
                    const submitted = await i.awaitModalSubmit({ time: 60000, filter: m => m.user.id === interaction.user.id });
                    
                    const url = submitted.fields.getTextInputValue('greet_img_url');
                    config.image = url || null;
                    db[guildId] = config;
                    writeDb(db);

                    await showCustomizationMenu(submitted, config, guildId);
                } catch (err) {
                    // console.error("Modal error", err);
                }
            }
            else if (i.customId === 'greet_test') {
                if (!config.channelId) {
                    return i.reply({ content: "No channel selected!", ephemeral: true });
                }
                const channel = interaction.guild.channels.cache.get(config.channelId);
                if (!channel) {
                    return i.reply({ content: "Channel not found!", ephemeral: true });
                }

                const testEmbed = new EmbedBuilder()
                    .setTitle(config.title
                        .replace(/{server}/g, interaction.guild.name)
                        .replace(/{user}/g, interaction.user.username)
                        .replace(/{count}/g, interaction.guild.memberCount.toString())
                    )
                    .setDescription(config.description
                        .replace(/{server}/g, interaction.guild.name)
                        .replace(/{user}/g, `<@${interaction.user.id}>`)
                        .replace(/{count}/g, interaction.guild.memberCount.toString())
                    )
                    .setColor(config.color || 0x00FF00);
                
                if (config.image) {
                    testEmbed.setImage(config.image);
                } else {
                    testEmbed.setThumbnail(interaction.user.displayAvatarURL({ extension: 'png' }));
                }
                
                try {
                    await channel.send({ embeds: [testEmbed] });
                    await i.reply({ content: `Test message sent to <#${config.channelId}>`, ephemeral: true });
                } catch (err) {
                    await i.reply({ content: `Failed to send test message: ${err.message}`, ephemeral: true });
                }
            }
        });
    }
};

async function showCustomizationMenu(i, config, guildId) {
    const embed = new EmbedBuilder()
        .setTitle("Customize Greeting")
        .setDescription(`**Title:** ${config.title}\n**Description:** ${config.description}\n**Image:** ${config.image ? "Set" : "None"}`)
        .addFields({ name: "Preview Variables", value: "{server}, {user}, {count}" })
        .setColor(0x0099FF);
        
    if (config.image) {
        embed.setImage(config.image);
    } else {
        embed.setThumbnail(i.user.displayAvatarURL({ extension: 'png' }));
    }

    const btnEditMsg = new ButtonBuilder().setCustomId('greet_edit_msg').setLabel('Edit Message').setStyle(ButtonStyle.Secondary);
    const btnEditImg = new ButtonBuilder().setCustomId('greet_edit_img').setLabel('Edit Image').setStyle(ButtonStyle.Secondary);
    const btnTest = new ButtonBuilder().setCustomId('greet_test').setLabel('Test Greet').setStyle(ButtonStyle.Success);
    const btnClose = new ButtonBuilder().setCustomId('greet_close').setLabel('✖').setStyle(ButtonStyle.Secondary);
    
    const row = new ActionRowBuilder().addComponents(btnEditMsg, btnEditImg, btnTest, btnClose);
    
    if (i.isModalSubmit && i.isModalSubmit()) {
         await i.update({ embeds: [embed], components: [row] });
    } else {
         await i.update({ embeds: [embed], components: [row] });
    }
}

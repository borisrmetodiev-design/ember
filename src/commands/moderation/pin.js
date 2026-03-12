const { PermissionFlagsBits } = require("discord.js");

module.exports = {
    name: "pin",
    aliases: [],

    async executePrefix(message) {
        try {
            if (!message.guild) return;
            
            if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return message.reply("You need **Manage Messages** permissions to pin messages.");
            }

            const reference = message.reference;
            if (!reference || !reference.messageId) {
                return message.reply("You must reply to a message to pin it.");
            }

            const replyMessage = await message.channel.messages.fetch(reference.messageId);
            
            if (replyMessage.pinned) return;

            await replyMessage.pin();
            
            // Delete the trigger message to keep things clean if preferred, 
            // otherwise just don't send a confirmation embed.
            await message.delete().catch(() => null);

        } catch (err) {
            if (err.code === 50013) {
                return message.reply("I don't have permission to pin messages in this channel.");
            }
            if (err.code === 30003) {
                return message.reply("This channel has reached the maximum number of pinned messages (50).");
            }
            throw { code: "014", err };
        }
    }
};

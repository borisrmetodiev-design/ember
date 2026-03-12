const { PermissionFlagsBits } = require("discord.js");

module.exports = {
    name: "unpin",
    aliases: [],

    async executePrefix(message) {
        try {
            if (!message.guild) return;
            
            if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return message.reply("You need **Manage Messages** permissions to unpin messages.");
            }

            const reference = message.reference;
            if (!reference || !reference.messageId) {
                return message.reply("You must reply to a message to unpin it.");
            }

            const replyMessage = await message.channel.messages.fetch(reference.messageId);
            
            if (!replyMessage.pinned) return;

            await replyMessage.unpin();
            
            await message.delete().catch(() => null);

        } catch (err) {
            if (err.code === 50013) {
                return message.reply("I don't have permission to unpin messages in this channel.");
            }
            throw { code: "014", err };
        }
    }
};

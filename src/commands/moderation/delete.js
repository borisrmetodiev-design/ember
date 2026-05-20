const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "delete",
    aliases: ["del"],
    description: "Deletes the message that this command replies to (Admin only)",

    async executePrefix(message, args, client) {
        try {
            const authorId = message.author.id;
            const allowedIds = new Set([
                process.env.BORIS_ID_1,
                process.env.BORIS_ID_2
            ].filter(Boolean));

            // Permission check
            if (!allowedIds.has(authorId)) {
                throw { code: "021" }; // Permission denied
            }

            const reference = message.reference;
            if (!reference || !reference.messageId) {
                return message.reply("You must reply to a message to delete it.");
            }

            let replyMessage;
            try {
                replyMessage = await message.channel.messages.fetch(reference.messageId);
            } catch (fetchErr) {
                if (fetchErr.code === 10008) {
                    return message.reply("The referenced message could not be found or has already been deleted.");
                }
                throw fetchErr;
            }
            
            // Delete the referenced message
            await replyMessage.delete();

            // Delete the command message to keep things clean
            await message.delete().catch(() => null);

        } catch (err) {
            if (err.code === 50013) {
                return message.reply("I don't have permission to delete messages in this channel.");
            }
            throw err.code ? err : { code: "014", err };
        }
    }
};

/**
 * Example plugin file
 * Simple ping command
 */

exports.run = {
    name: "Ping",
    desc: "Check bot response time",
    alias: ["p", "pong", /^ping$/i],
    noPrefix: true,
    exec: async (m, { conn, text, args, isAdmin, isOwner }) => {
        const start = new Date();
        await m.reply("Testing response time...");
        const end = new Date();
        const responseTime = end - start;

        if (isAdmin) {
            m.reply(`Kamu adalah admin`);
            if (isOwner) m.reply("Kamu adalah owner")
        } else {
            m.reply("Kamu bukan admin")
        }

        m.reply(`🏓 Pong!\nResponse: ${responseTime}ms`);
    }
}
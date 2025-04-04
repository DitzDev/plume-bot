/**
 * Case commands for WhatsApp Bot
 */
module.exports = (m, conn, chatUpdate) => {
  const command = m.body.slice(1).trim().split(" ")[0].toLowerCase();

  switch (command) {
    case "pcase": {
      m.reply("Ping from case responded!");
      break;
    }

    // Add more cases here

    default:
      // Handle unknown commands if needed
      break;
  }
}
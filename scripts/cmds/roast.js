"use strict";

module.exports = {
  config: {
    name: "roast",
    aliases: [],
    version: "1.0",
    author: "Certified Liar",
    countDown: 5,
    role: 0,
    shortDescription: "",
    longDescription: "Insult someone by using this cmd",
    category: "𝗙𝗨𝗡",
    guide: "{pn} @mention",
  },

  onStart: async function ({ message, event, args }) {
    try {
      const mention = Object.keys(event.mentions);

      if (mention.length !== 1) {
        message.reply("Please mention one person to insult.", event.threadID);
        return;
      }

      const mentionName = event.mentions[mention[0]].replace("@", ""); 

      if (mentionName.toLowerCase().includes("ᴄᴇʀᴛɪɪジ")) {//replace kshitiz with your name
        message.reply("Ayo Gay You can't insult my owner🤬 ", event.threadID);
        return;
      }

      const url = "https://evilinsult.com/generate_insult.php?lang=en&type=json";

      const response = await axios.get(url);
      const insult = response.data.insult;

      const insultMessage = `${mentionName}, ${insult}`;
      message.reply(insultMessage, event.threadID);

    } catch (error) {
      console.error(error);
      message.reply("Error!", event.threadID);
    }
  },
};

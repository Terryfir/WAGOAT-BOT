"use strict";

const fs = require("fs-extra");
const { utils } = global;

module.exports = {
	config: {
		name: "prefix",
		version: "1.4",
		author: "Rômeo",
		countDown: 5,
		role: 0,
		description: "Thay đổi dấu lệnh của bot trong box chat của bạn hoặc cả hệ thống bot (chỉ admin bot)",
		category: "system",
		guide: {
			en: "   {pn} <new prefix>: change new prefix in your box chat"
				+ "\n   Example:"
				+ "\n    {pn} #"
				+ "\n\n   {pn} <new prefix> -g: change new prefix in system bot (only admin bot)"
				+ "\n   Example:"
				+ "\n    {pn} # -g"
				+ "\n\n   {pn} reset: change prefix in your box chat to default"
		}
	},

	langs: {
		en: {
			reset: "Your prefix has been reset to default: %1",
			onlyAdmin: "Only admin can change prefix of system bot",
			successGlobal: "Changed prefix of system bot to: %1",
			successThisThread: "Changed prefix in your box chat to: %1",
			myPrefix: "Hey, Terry speaking!🔥\n⚙ 𝗦𝘆𝘀𝘁𝗲𝗺 𝗣𝗿𝗲𝗳𝗶𝘅:- *%1*\n🛸 𝗕𝗼𝘅 𝗖𝗵𝗮𝘁 𝗣𝗿𝗲𝗳𝗶𝘅:- *%2*"
		}
	},

	getLang: function (lang, key, ...params) {
		const strings = this.langs[lang] || this.langs.en || {};
		let text = strings[key] || key;
		params.forEach((value, index) => {
			text = text.replace(new RegExp(`%${index + 1}`, "g"), value);
		});
		return text;
	},

	onStart: async function ({ message, role, args, commandName, event, threadsData }) {
		if (!args[0]) {
			if (typeof message.SyntaxError === "function") return message.SyntaxError();
			return message.reply("❌ Invalid syntax.");
		}

		const lang = global.GoatBot.config.language || "en";
		const _getLang = (key, ...params) => this.getLang(lang, key, ...params);

		if (args[0] == "reset") {
			await threadsData.set(event.threadID, null, "data.prefix");
			return message.reply(_getLang("reset", global.GoatBot.config.prefix || "!"));
		}

		const newPrefix = args[0];
		const setGlobal = args[1] === "-g";

		if (setGlobal && role < 2) {
			return message.reply(_getLang("onlyAdmin"));
		}

		if (setGlobal) {
			global.GoatBot.config.prefix = newPrefix;
			fs.writeFileSync(global.client.dirConfig, JSON.stringify(global.GoatBot.config, null, 2), "utf8");
			return message.reply(_getLang("successGlobal", newPrefix));
		}

		await threadsData.set(event.threadID, newPrefix, "data.prefix");
		return message.reply(_getLang("successThisThread", newPrefix));
	},

	onChat: async function ({ event, message }) {
		const body = (event && event.body) ? String(event.body).toLowerCase() : "";
		if (body === "prefix" || body === "bot") {
			const threadPrefix = await global.getThreadPrefix(event.threadID);
			return message.reply(this.getLang(global.GoatBot.config.language || "en", "myPrefix", global.GoatBot.config.prefix || "!", threadPrefix));
		}
	}
};

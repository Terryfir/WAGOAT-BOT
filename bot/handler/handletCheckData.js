"use strict";

async function handleCheckData(api, event) {
  if (!global.GoatBot ||!global.GoatBot.DB) return;

  const userData = global.GoatBot.DB.userData;
  const threadsData = global.GoatBot.DB.threadsData;

  try {
    if (event.senderID) {
      const user = await userData(event.senderID);

      const pushName = event.senderName || event.pushName || (event.raw && event.raw.pushName);
      if (pushName && pushName.trim() && pushName.trim()!== user.name) {
        await global.GoatBot.DB.users.set(event.senderID, pushName.trim(), "name");
      } else if (!user.name || user.name === "Unknown") {
        try {
          const sock = global.GoatBot.api && global.GoatBot.api.sock;
          if (sock && sock.contacts) {
            const baileys = require("../login/baileys");
            const normUID = baileys.normUID;
            const num = normUID(event.senderID);
            const lidKey = num + "@lid";
            const phoneKey = num + "@s.whatsapp.net";
            const contact = sock.contacts[phoneKey] || sock.contacts[lidKey];
            const cName = contact && (contact.name || contact.notify || contact.verifiedName);
            if (cName && cName!== user.name) {
              await global.GoatBot.DB.users.set(event.senderID, cName, "name");
            }
          }
        } catch (_) {}
      }

      try {
        const current = await userData(event.senderID);
        await global.GoatBot.DB.users.set(event.senderID, (current.msgCount || 0) + 1, "msgCount");
      } catch (_) {}
    }

    if (event.mentions && event.mentions.length > 0) {
      try {
        const sock2 = global.GoatBot.api && global.GoatBot.api.sock;
        if (sock2 && sock2.contacts) {
          const baileys2 = require("../login/baileys");
          const normUID2 = baileys2.normUID;
          for (const i = 0; i < event.mentions.length; i++) {
            const mID = event.mentions[i];
            const num2 = normUID2(mID);
            const contact2 = sock2.contacts[num2 + "@s.whatsapp.net"] || sock2.contacts[num2 + "@lid"];
            const cName2 = contact2 && (contact2.name || contact2.notify || contact2.verifiedName);
            if (cName2) {
              const mUser = await userData(mID);
              if (mUser.name!== cName2) {
                await global.GoatBot.DB.users.set(mID, cName2, "name");
              }
            }
          }
        }
      } catch (_) {}
    }

    if (event.threadID && event.isGroup) {
      const thread = await threadsData(event.threadID);

      if (!thread.threadName || thread.threadName === "Unknown Group" ||!thread.members || thread.members.length === 0) {
        try {
          const info = await api.getGroupInfo(event.threadID);
          await global.GoatBot.DB.threads.refreshInfo(event.threadID, info);
        } catch (_) {}
      }

      if (event.senderID) {
        try {
          await global.GoatBot.DB.threads.incrementMsgCount(event.threadID, event.senderID);
        } catch (_) {}
      }
    }

  } catch (_) {}
}

module.exports = handleCheckData;
module.exports.default = handleCheckData;
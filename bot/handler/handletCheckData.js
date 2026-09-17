"use strict";

async function handleCheckData(api, event) {
  if (!global.GoatBot ||!global.GoatBot.DB) return;

  var userData = global.GoatBot.DB.userData;
  var threadsData = global.GoatBot.DB.threadsData;

  try {
    if (event.senderID) {
      var user = await userData(event.senderID);

      var pushName = event.senderName || event.pushName || (event.raw && event.raw.pushName);
      if (pushName && pushName.trim() && pushName.trim()!== user.name) {
        await global.GoatBot.DB.users.set(event.senderID, pushName.trim(), "name");
      } else if (!user.name || user.name === "Unknown") {
        try {
          var sock = global.GoatBot.api && global.GoatBot.api.sock;
          if (sock && sock.contacts) {
            var baileys = require("../login/baileys");
            var normUID = baileys.normUID;
            var num = normUID(event.senderID);
            var lidKey = num + "@lid";
            var phoneKey = num + "@s.whatsapp.net";
            var contact = sock.contacts[phoneKey] || sock.contacts[lidKey];
            var cName = contact && (contact.name || contact.notify || contact.verifiedName);
            if (cName && cName!== user.name) {
              await global.GoatBot.DB.users.set(event.senderID, cName, "name");
            }
          }
        } catch (_) {}
      }

      try {
        var current = await userData(event.senderID);
        await global.GoatBot.DB.users.set(event.senderID, (current.msgCount || 0) + 1, "msgCount");
      } catch (_) {}
    }

    if (event.mentions && event.mentions.length > 0) {
      try {
        var sock2 = global.GoatBot.api && global.GoatBot.api.sock;
        if (sock2 && sock2.contacts) {
          var baileys2 = require("../login/baileys");
          var normUID2 = baileys2.normUID;
          for (var i = 0; i < event.mentions.length; i++) {
            var mID = event.mentions[i];
            var num2 = normUID2(mID);
            var contact2 = sock2.contacts[num2 + "@s.whatsapp.net"] || sock2.contacts[num2 + "@lid"];
            var cName2 = contact2 && (contact2.name || contact2.notify || contact2.verifiedName);
            if (cName2) {
              var mUser = await userData(mID);
              if (mUser.name!== cName2) {
                await global.GoatBot.DB.users.set(mID, cName2, "name");
              }
            }
          }
        }
      } catch (_) {}
    }

    if (event.threadID && event.isGroup) {
      var thread = await threadsData(event.threadID);

      if (!thread.threadName || thread.threadName === "Unknown Group" ||!thread.members || thread.members.length === 0) {
        try {
          var info = await api.getGroupInfo(event.threadID);
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

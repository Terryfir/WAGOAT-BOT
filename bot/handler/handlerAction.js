"use strict";

var baileys = require("../login/baileys");
var normUID = baileys.normUID;

function isAdminUID(senderID, adminList) {
  var senderNum = normUID(senderID);
  var list = adminList || [];
  return list.some(function(a) {
    return normUID(a) === senderNum;
  });
}

async function handlerAction(api, event) {
  var cfg = global.GoatBot.config;
  var fb = cfg.featureBox || {};

  var senderID = event.senderID;
  var threadID = event.threadID;
  var adminList = cfg.adminBot || [];
  var isAdmin = isAdminUID(senderID, adminList);

  if (event.type === "message_reaction") {
    if (fb.unsendBotReact) {
      var reactEmoji = fb.unsendBotReactEmoji || "❌";
      var emoji = (event.emoji || "").trim();
      if (emoji === String(reactEmoji).trim() && isAdmin && event.reactionKey) {
        try {
          var msgKey = { remoteJid: threadID, id: event.reactionKey.id, fromMe: true };
          await api.deleteMessage(threadID, msgKey, true);
        } catch (e) {
          try { global.log.warn("UNSEND", "React delete failed: " + e.message); } catch (_) {}
        }
        return false;
      }
    }
  }

  if (fb.antiInbox &&!event.isGroup &&!isAdmin) {
    return false;
  }

  if (!isAdmin) {
    if (fb.whitelistThreadMode && event.isGroup) {
      if (fb.whitelistThreadIDs && fb.whitelistThreadIDs.indexOf(threadID) === -1) {
        return false;
      }
    }
    var isWhiteListModeEnabled = fb.whitelistMode === true;
    var isWhiteListThreadModeEnabled = fb.whitelistThreadMode === true;
    var isApproveThreadModeEnabled = fb.approveThreadMode === true;

    var whiteListUIDs = fb.whitelistUIDs || [];
    var isWhitelistedUser = whiteListUIDs.map(normUID).indexOf(normUID(senderID))!== -1;

    if (isWhiteListModeEnabled &&!isWhitelistedUser) {
      return false;
    }

    var isGroup = event.isGroup || (threadID && threadID.endsWith("@g.us"));

    if (isWhiteListThreadModeEnabled && isGroup) {
      var isWhitelistedThread = (fb.whitelistThreadIDs || []).indexOf(threadID)!== -1;
      if (!isWhitelistedThread) {
        return false;
      }
    }

    if (isApproveThreadModeEnabled && isGroup) {
      var isApprovedThread = false;
      var dbInstance = (global.db && global.db.threadsData) || (global.GoatBot.DB && global.GoatBot.DB.threadsData);
      if (dbInstance) {
        try {
          var tData = await dbInstance.get(threadID);
          if (tData && tData.data && tData.data.isApproved === true) {
            isApprovedThread = true;
          }
        } catch (_) {}
      }

      if (!isApprovedThread) {
        if (event.type === "message" && event.body) {
          var body = event.body.trim();
          var prefix = typeof global.getThreadPrefix === "function"
           ? await global.getThreadPrefix(threadID)
            : cfg.prefix;
          if (body.indexOf(prefix) === 0) {
            var mentionJIDs = [];
            var mentionTexts = [];
            for (var i = 0; i < adminList.length; i++) {
              var admin = adminList[i];
              if (!admin) continue;
              var bare = admin.split(":")[0].split("@")[0];
              var isLid = /^[12]\d{14}$/.test(bare);
              var jid = bare + (isLid? "@lid" : "@s.whatsapp.net");
              mentionJIDs.push(jid);
              mentionTexts.push("@" + bare);
            }
            var adminText = mentionTexts.length > 0? mentionTexts.join(", ") : "the bot owner";

            var message = global.buildMessage(api, event);
            message.reply({
              body: "❌ *Group Not Approved!* This group is not authorized to use the bot.\n📌 *Group ID:* `" + threadID + "`\n💬 Please contact the bot owner: " + adminText + " to approve this group.",
              mentions: mentionJIDs
            }).catch(function() {});
          }
        }
        return false;
      }
    }
  }

  if (fb.adminOnly &&!isAdmin) {
    var isIgnoredCmd = false;
    if (event.type === "message" && event.body) {
      var body2 = event.body.trim();
      var prefix2 = cfg.prefix || "+";
      if (body2.indexOf(prefix2) === 0) {
        var rawCmd = body2.slice(prefix2.length).trim().split(/\s+/)[0].toLowerCase();
        var ignoreList = Array.isArray(fb.ignoreCommand)? fb.ignoreCommand : [];
        var cmd = global.GoatBot.cmds.get(rawCmd);
        if (!cmd) {
          var iterator = global.GoatBot.cmds.entries();
          var item;
          while (!(item = iterator.next()).done) {
            var val = item.value[1];
            if (val.config && Array.isArray(val.config.aliases) && val.config.aliases.map(function(a){ return String(a).toLowerCase(); }).indexOf(rawCmd)!== -1) {
              cmd = val;
              break;
            }
          }
        }
        var cmdName = cmd? cmd.config.name : rawCmd;
        if (ignoreList.indexOf(cmdName)!== -1 || ignoreList.indexOf(rawCmd)!== -1) {
          isIgnoredCmd = true;
        }
      }
    }
    if (!isIgnoredCmd) return false;
  }

  try {
    if (event.isGroup && global.GoatBot.DB && global.GoatBot.DB.threadsData) {
      var threadData = await global.GoatBot.DB.threadsData.get(threadID);

      if (threadData && threadData.data && threadData.data.blacklistMode === true &&!isAdmin) {
        var isAllowedCmd = false;
        if (event.type === "message" && event.body) {
          var body3 = event.body.trim();
          var prefix3 = typeof global.getThreadPrefix === "function"
           ? await global.getThreadPrefix(threadID)
            : (cfg.prefix || ".");
          var allowedCmdsRaw = Array.isArray(threadData.data.blacklistCmds)? threadData.data.blacklistCmds : [];
          var allowedCmds = allowedCmdsRaw.map(function(c){ return String(c).toLowerCase(); });

          if (body3.indexOf(prefix3) === 0) {
            var rawCmd2 = body3.slice(prefix3.length).trim().split(/\s+/)[0].toLowerCase();
            var cmd2 = global.GoatBot.cmds.get(rawCmd2);
            if (!cmd2) {
              for (var _iter of global.GoatBot.cmds) {
                var _val = _iter[1];
                if (_val.config && Array.isArray(_val.config.aliases) && _val.config.aliases.map(function(a){ return String(a).toLowerCase(); }).indexOf(rawCmd2)!== -1) {
                  cmd2 = _val;
                  break;
                }
              }
            }
            var cmdName2 = cmd2? cmd2.config.name.toLowerCase() : rawCmd2;
            if (cmdName2 === "blacklist" || allowedCmds.indexOf(cmdName2)!== -1 || allowedCmds.indexOf(rawCmd2)!== -1) {
              isAllowedCmd = true;
            }
          } else {
            var firstWord = body3.split(/\s+/)[0].toLowerCase();
            if (allowedCmds.indexOf(firstWord)!== -1) {
              isAllowedCmd = true;
            }
          }
        }
        if (!isAllowedCmd) return false;
      }

      if (threadData && threadData.banned) {
        var updated = false;
        for (var uid in threadData.banned) {
          if (uid === "status" || uid === "reason" || uid === "date") continue;
          var banInfo = threadData.banned[uid];
          if (banInfo && banInfo.expiry && Date.now() > banInfo.expiry) {
            delete threadData.banned[uid];
            updated = true;
          }
        }
        if (updated) {
          try {
            await global.GoatBot.DB.threadsData.set(threadID, threadData.banned, "banned");
          } catch (_) {}
        }

        if (threadData.banned.status === true) {
          if (event.type === "message" && event.body) {
            var body4 = event.body.trim();
            var prefix4 = typeof global.getThreadPrefix === "function"
             ? await global.getThreadPrefix(threadID)
              : global.GoatBot.config.prefix;
            if (body4.indexOf(prefix4) === 0) {
              var message2 = global.buildMessage(api, event);
              var reasonText = threadData.banned.reason? "\n\n📋 *Reason:* " + threadData.banned.reason : "";
              message2.reply("⛔ *This group is banned from using the bot.*" + reasonText).catch(function(){});
            }
          }
          return false;
        }

        if (threadData.banned[senderID]) {
          var banInfo2 = threadData.banned[senderID];
          if (event.type === "message" && event.body) {
            var body5 = event.body.trim();
            var prefix5 = typeof global.getThreadPrefix === "function"
             ? await global.getThreadPrefix(threadID)
              : global.GoatBot.config.prefix;
            if (body5.indexOf(prefix5) === 0) {
              var message3 = global.buildMessage(api, event);
              var reasonText2 = banInfo2.reason? "\n\n📋 *Reason:* " + banInfo2.reason : "";
              var expiryText = banInfo2.expiry? "\n⏳ *Expires on:* " + new Date(banInfo2.expiry).toLocaleString() : "\n⏳ *Expires on:* Never (Permanent)";
              message3.reply("⛔ *You are thread-banned from using the bot in this group.*" + reasonText2 + expiryText).catch(function(){});
            }
          }
          return false;
        }
      }
    }
  } catch (_) {}

  try {
    if (global.GoatBot.DB && global.GoatBot.DB.userData) {
      var user = await global.GoatBot.DB.userData.get(senderID);
      if (user && user.isBan) {
        if (event.type === "message" && event.body) {
          var body6 = event.body.trim();
          var prefix6 = typeof global.getThreadPrefix === "function"
           ? await global.getThreadPrefix(threadID)
            : global.GoatBot.config.prefix;
          if (body6.indexOf(prefix6) === 0) {
            var message4 = global.buildMessage(api, event);
            var reasonText3 = user.banReason? "\n\n📋 *Reason:* " + user.banReason : "";
            message4.reply("⛔ *You are banned from using the bot.*" + reasonText3).catch(function(){});
          }
        }
        return false;
      }
    }
  } catch (_) {}

  return true;
}

module.exports = {
  isAdminUID: isAdminUID,
  handlerAction: handlerAction
};

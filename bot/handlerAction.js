"use strict";

const baileys = require("../login/baileys");
const normUID = baileys.normUID;

function isAdminUID(senderID, adminList) {
  const senderNum = normUID(senderID);
  const list = adminList || [];
  return list.some(function(a) {
    return normUID(a) === senderNum;
  });
}

async function handlerAction(api, event) {
  const cfg = global.GoatBot.config;
  const fb = cfg.featureBox || {};

  const senderID = event.senderID;
  const threadID = event.threadID;
  const adminList = cfg.adminBot || [];
  const isAdmin = isAdminUID(senderID, adminList);

  if (event.type === "message_reaction") {
    if (fb.unsendBotReact) {
      const reactEmoji = fb.unsendBotReactEmoji || "❌";
      const emoji = (event.emoji || "").trim();
      if (emoji === String(reactEmoji).trim() && isAdmin && event.reactionKey) {
        try {
          const msgKey = { remoteJid: threadID, id: event.reactionKey.id, fromMe: true };
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
    const isWhiteListModeEnabled = fb.whitelistMode === true;
    const isWhiteListThreadModeEnabled = fb.whitelistThreadMode === true;
    const isApproveThreadModeEnabled = fb.approveThreadMode === true;

    const whiteListUIDs = fb.whitelistUIDs || [];
    const isWhitelistedUser = whiteListUIDs.map(normUID).indexOf(normUID(senderID))!== -1;

    if (isWhiteListModeEnabled &&!isWhitelistedUser) {
      return false;
    }

    const isGroup = event.isGroup || (threadID && threadID.endsWith("@g.us"));

    if (isWhiteListThreadModeEnabled && isGroup) {
      const isWhitelistedThread = (fb.whitelistThreadIDs || []).indexOf(threadID)!== -1;
      if (!isWhitelistedThread) {
        return false;
      }
    }

    if (isApproveThreadModeEnabled && isGroup) {
      const isApprovedThread = false;
      const dbInstance = (global.db && global.db.threadsData) || (global.GoatBot.DB && global.GoatBot.DB.threadsData);
      if (dbInstance) {
        try {
          const tData = await dbInstance.get(threadID);
          if (tData && tData.data && tData.data.isApproved === true) {
            isApprovedThread = true;
          }
        } catch (_) {}
      }

      if (!isApprovedThread) {
        if (event.type === "message" && event.body) {
          const body = event.body.trim();
          const prefix = typeof global.getThreadPrefix === "function"
           ? await global.getThreadPrefix(threadID)
            : cfg.prefix;
          if (body.indexOf(prefix) === 0) {
            const mentionJIDs = [];
            const mentionTexts = [];
            for (const i = 0; i < adminList.length; i++) {
              const admin = adminList[i];
              if (!admin) continue;
              const bare = admin.split(":")[0].split("@")[0];
              const isLid = /^[12]\d{14}$/.test(bare);
              const jid = bare + (isLid? "@lid" : "@s.whatsapp.net");
              mentionJIDs.push(jid);
              mentionTexts.push("@" + bare);
            }
            const adminText = mentionTexts.length > 0? mentionTexts.join(", ") : "the bot owner";

            const message = global.buildMessage(api, event);
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
    const isIgnoredCmd = false;
    if (event.type === "message" && event.body) {
      const body2 = event.body.trim();
      const prefix2 = cfg.prefix || "+";
      if (body2.indexOf(prefix2) === 0) {
        const rawCmd = body2.slice(prefix2.length).trim().split(/\s+/)[0].toLowerCase();
        const ignoreList = Array.isArray(fb.ignoreCommand)? fb.ignoreCommand : [];
        const cmd = global.GoatBot.cmds.get(rawCmd);
        if (!cmd) {
          const iterator = global.GoatBot.cmds.entries();
          const item;
          while (!(item = iterator.next()).done) {
            const val = item.value[1];
            if (val.config && Array.isArray(val.config.aliases) && val.config.aliases.map(function(a){ return String(a).toLowerCase(); }).indexOf(rawCmd)!== -1) {
              cmd = val;
              break;
            }
          }
        }
        const cmdName = cmd? cmd.config.name : rawCmd;
        if (ignoreList.indexOf(cmdName)!== -1 || ignoreList.indexOf(rawCmd)!== -1) {
          isIgnoredCmd = true;
        }
      }
    }
    if (!isIgnoredCmd) return false;
  }

  try {
    if (event.isGroup && global.GoatBot.DB && global.GoatBot.DB.threadsData) {
      const threadData = await global.GoatBot.DB.threadsData.get(threadID);

      if (threadData && threadData.data && threadData.data.blacklistMode === true &&!isAdmin) {
        const isAllowedCmd = false;
        if (event.type === "message" && event.body) {
          const body3 = event.body.trim();
          const prefix3 = typeof global.getThreadPrefix === "function"
           ? await global.getThreadPrefix(threadID)
            : (cfg.prefix || ".");
          const allowedCmdsRaw = Array.isArray(threadData.data.blacklistCmds)? threadData.data.blacklistCmds : [];
          const allowedCmds = allowedCmdsRaw.map(function(c){ return String(c).toLowerCase(); });

          if (body3.indexOf(prefix3) === 0) {
            const rawCmd2 = body3.slice(prefix3.length).trim().split(/\s+/)[0].toLowerCase();
            const cmd2 = global.GoatBot.cmds.get(rawCmd2);
            if (!cmd2) {
              for (const _iter of global.GoatBot.cmds) {
                const _val = _iter[1];
                if (_val.config && Array.isArray(_val.config.aliases) && _val.config.aliases.map(function(a){ return String(a).toLowerCase(); }).indexOf(rawCmd2)!== -1) {
                  cmd2 = _val;
                  break;
                }
              }
            }
            const cmdName2 = cmd2? cmd2.config.name.toLowerCase() : rawCmd2;
            if (cmdName2 === "blacklist" || allowedCmds.indexOf(cmdName2)!== -1 || allowedCmds.indexOf(rawCmd2)!== -1) {
              isAllowedCmd = true;
            }
          } else {
            const firstWord = body3.split(/\s+/)[0].toLowerCase();
            if (allowedCmds.indexOf(firstWord)!== -1) {
              isAllowedCmd = true;
            }
          }
        }
        if (!isAllowedCmd) return false;
      }

      if (threadData && threadData.banned) {
        const updated = false;
        for (const uid in threadData.banned) {
          if (uid === "status" || uid === "reason" || uid === "date") continue;
          const banInfo = threadData.banned[uid];
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
            const body4 = event.body.trim();
            const prefix4 = typeof global.getThreadPrefix === "function"
             ? await global.getThreadPrefix(threadID)
              : global.GoatBot.config.prefix;
            if (body4.indexOf(prefix4) === 0) {
              const message2 = global.buildMessage(api, event);
              const reasonText = threadData.banned.reason? "\n\n📋 *Reason:* " + threadData.banned.reason : "";
              message2.reply("⛔ *This group is banned from using the bot.*" + reasonText).catch(function(){});
            }
          }
          return false;
        }

        if (threadData.banned[senderID]) {
          const banInfo2 = threadData.banned[senderID];
          if (event.type === "message" && event.body) {
            const body5 = event.body.trim();
            const prefix5 = typeof global.getThreadPrefix === "function"
             ? await global.getThreadPrefix(threadID)
              : global.GoatBot.config.prefix;
            if (body5.indexOf(prefix5) === 0) {
              const message3 = global.buildMessage(api, event);
              const reasonText2 = banInfo2.reason? "\n\n📋 *Reason:* " + banInfo2.reason : "";
              const expiryText = banInfo2.expiry? "\n⏳ *Expires on:* " + new Date(banInfo2.expiry).toLocaleString() : "\n⏳ *Expires on:* Never (Permanent)";
      
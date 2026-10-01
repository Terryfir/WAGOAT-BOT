"use strict";
// ─── handlerAction.js ─────────────────────────────────────────────────────────

import { normUID } from "../login/baileys";

export function isAdminUID(senderID, adminList) {
  const senderNum = normUID(senderID);
  return (adminList || []).some(a => normUID(a) === senderNum);
}

export async function handlerAction(api, event) {
  const cfg = global.GoatBot.config;
  const fb = cfg.featureBox || {};

  const senderID = event.senderID;
  const threadID = event.threadID;
  const adminList = cfg.adminBot || [];
  const isAdmin = isAdminUID(senderID, adminList);

  if (event.type === "message_reaction") {
    if (fb.unsendBotReact) {
      const reactEmoji = fb.unsendBotReactEmoji || "❌";
      if ((event.emoji || "").trim() === String(reactEmoji).trim() && isAdmin && event.reactionKey) {
        try {
          const msgKey = { remoteJid: threadID, id: event.reactionKey.id, fromMe: true };
          await api.deleteMessage(threadID, msgKey, true);
        } catch (e) {
          try { global.log.warn("UNSEND", "React delete failed: " + e.message); } catch (_) { }
        }
        return false;
      }
    }
  }

  if (fb.antiInbox && !event.isGroup && !isAdmin) {
    return false;
  }

  if (!isAdmin) {
    if (fb.whitelistThreadMode && event.isGroup) {
      if (!fb.whitelistThreadIDs?.includes(threadID)) {
        return false;
      }
    }
    const isWhiteListModeEnabled = fb.whitelistMode === true;
    const isWhiteListThreadModeEnabled = fb.whitelistThreadMode === true;
    const isApproveThreadModeEnabled = fb.approveThreadMode === true;

    const isWhitelistedUser = (fb.whitelistUIDs || []).map(normUID).includes(normUID(senderID));

    if (isWhiteListModeEnabled && !isWhitelistedUser) {
      return false;
    }

    const isGroup = event.isGroup || (threadID && threadID.endsWith("@g.us"));

    if (isWhiteListThreadModeEnabled && isGroup) {
      const isWhitelistedThread = (fb.whitelistThreadIDs || []).includes(threadID);
      if (!isWhitelistedThread) {
        return false;
      }
    }

    if (isApproveThreadModeEnabled && isGroup) {
      let isApprovedThread = false;
      const dbInstance = global.db?.threadsData || global.GoatBot.DB?.threadsData;
      if (dbInstance) {
        try {
          const tData = await dbInstance.get(threadID);
          if (tData && tData.data && tData.data.isApproved === true) {
            isApprovedThread = true;
          }
        } catch (_) { }
      }

      if (!isApprovedThread) {
        if (event.type === "message" && event.body) {
          const body = event.body.trim();
          const prefix = typeof global.getThreadPrefix === "function"
            ? await global.getThreadPrefix(threadID)
            : cfg.prefix;
          if (body.startsWith(prefix)) {
            const mentionJIDs = [];
            const mentionTexts = [];
            for (const admin of adminList) {
              if (!admin) continue;
              const bare = admin.split(":")[0].split("@")[0];
              const isLid = /^[12]\d{14}$/.test(bare);
              const jid = bare + (isLid ? "@lid" : "@s.whatsapp.net");
              mentionJIDs.push(jid);
              mentionTexts.push(`@${bare}`);
            }
            const adminText = mentionTexts.length > 0 ? mentionTexts.join(", ") : "the bot owner";

            const message = global.buildMessage(api, event);
            message.reply({
              body: `❌ *Group Not Approved!* This group is not authorized to use the bot.\n📌 *Group ID:* \`${threadID}\`\n💬 Please contact the bot owner: ${adminText} to approve this group.`,
              mentions: mentionJIDs
            }).catch(() => { });
          }
        }
        return false;
      }
    }
  }

  if (fb.adminOnly && !isAdmin) {
    let isIgnoredCmd = false;
    if (event.type === "message" && event.body) {
      const body = event.body.trim();
      const prefix = cfg.prefix || "+";
      if (body.startsWith(prefix)) {
        const rawCmd = body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();
        const ignoreList = Array.isArray(fb.ignoreCommand) ? fb.ignoreCommand : [];
        let cmd = global.GoatBot.cmds.get(rawCmd);
        if (!cmd) {
          for (const [, val] of global.GoatBot.cmds) {
            if (val.config && Array.isArray(val.config.aliases) && val.config.aliases.map(a => String(a).toLowerCase()).includes(rawCmd)) {
              cmd = val;
              break;
            }
          }
        }
        const cmdName = cmd ? cmd.config.name : rawCmd;
        if (ignoreList.includes(cmdName) || ignoreList.includes(rawCmd)) {
          isIgnoredCmd = true;
        }
      }
    }
    if (!isIgnoredCmd) return false;
  }

  try {
    if (event.isGroup && global.GoatBot.DB && global.GoatBot.DB.threadsData) {
      const threadData = await global.GoatBot.DB.threadsData.get(threadID);

      // Blacklist Mode check: when enabled, ONLY whitelisted commands work; ALL other commands & events stay silent!
      if (threadData && threadData.data && threadData.data.blacklistMode === true && !isAdmin) {
        let isAllowedCmd = false;
        if (event.type === "message" && event.body) {
          const body = event.body.trim();
          const prefix = typeof global.getThreadPrefix === "function"
            ? await global.getThreadPrefix(threadID)
            : (cfg.prefix || ".");

          const allowedCmds = Array.isArray(threadData.data.blacklistCmds)
            ? threadData.data.blacklistCmds.map(c => String(c).toLowerCase())
            : [];

          if (body.startsWith(prefix)) {
            const rawCmd = body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();
            let cmd = global.GoatBot.cmds.get(rawCmd);
            if (!cmd) {
              for (const [, val] of global.GoatBot.cmds) {
                if (val.config && Array.isArray(val.config.aliases) && val.config.aliases.map(a => String(a).toLowerCase()).includes(rawCmd)) {
                  cmd = val;
                  break;
                }
              }
            }

            const cmdName = cmd ? cmd.config.name.toLowerCase() : rawCmd;

            if (cmdName === "blacklist" || allowedCmds.includes(cmdName) || allowedCmds.includes(rawCmd)) {
              isAllowedCmd = true;
            }
          } else {
            const firstWord = body.split(/\s+/)[0].toLowerCase();
            if (allowedCmds.includes(firstWord)) {
              isAllowedCmd = true;
            }
          }
        }

        if (!isAllowedCmd) return false;
      }

      if (threadData && threadData.banned) {
        let updated = false;
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
          } catch (_) { }
        }

        if (threadData.banned.status === true) {
          if (event.type === "message" && event.body) {
            const body = event.body.trim();
            const prefix = typeof global.getThreadPrefix === "function"
              ? await global.getThreadPrefix(threadID)
              : global.GoatBot.config.prefix;

            if (body.startsWith(prefix)) {
              const message = global.buildMessage(api, event);
              const reasonText = threadData.banned.reason ? `\n\n📋 *Reason:* ${threadData.banned.reason}` : "";
              message.reply(`⛔ *This group is banned from using the bot.*${reasonText}`).catch(() => { });
            }
          }
          return false;
        }

        if (threadData.banned[senderID]) {
          const banInfo = threadData.banned[senderID];
          if (event.type === "message" && event.body) {
            const body = event.body.trim();
            const prefix = typeof global.getThreadPrefix === "function"
              ? await global.getThreadPrefix(threadID)
              : global.GoatBot.config.prefix;

            if (body.startsWith(prefix)) {
              const message = global.buildMessage(api, event);
              const reasonText = banInfo.reason ? `\n\n📋 *Reason:* ${banInfo.reason}` : "";
              const expiryText = banInfo.expiry ? `\n⏳ *Expires on:* ${new Date(banInfo.expiry).toLocaleString()}` : "\n⏳ *Expires on:* Never (Permanent)";
              message.reply(`⛔ *You are thread-banned from using the bot in this group.*${reasonText}${expiryText}`).catch(() => { });
            }
          }
          return false;
        }
      }
    }
  } catch (_) { }

  try {
    if (global.GoatBot.DB && global.GoatBot.DB.userData) {
      const user = await global.GoatBot.DB.userData.get(senderID);
      if (user && user.isBan) {
        if (event.type === "message" && event.body) {
          const body = event.body.trim();
          const prefix = typeof global.getThreadPrefix === "function"
            ? await global.getThreadPrefix(threadID)
            : global.GoatBot.config.prefix;

          if (body.startsWith(prefix)) {
            const message = global.buildMessage(api, event);
            const reasonText = user.banReason ? `\n\n📋 *Reason:* ${user.banReason}` : "";
            message.reply(`⛔ *You are banned from using the bot.*${reasonText}`).catch(() => { });
          }
        }
        return false;
      }
    }
  } catch (_) { }

  return true;
}

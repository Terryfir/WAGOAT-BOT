"use strict";
var handlerActionModule = require("./handlerAction");
var handlerAction = handlerActionModule.handlerAction;
var isAdminUID = handlerActionModule.isAdminUID;
var handleCheckData = require("./handletCheckData");
if (handleCheckData && handleCheckData.default) {
  handleCheckData = handleCheckData.default;
}
var baileys = require("../login/baileys");
var normUID = baileys.normUID;

async function logIncoming(event) {
  var c = global.utils.colors;
  var rawSender = event.senderID || event.lid || event.phoneUID || (event.raw && event.raw.key && event.raw.key.participant) || (event.raw && event.raw.participant) || "";
  var num = normUID(rawSender) || "Unknown";
  var name = rawSender? await global.getDisplayName(rawSender) : "Unknown";
  var who = name!== num && name!== "Unknown"? c.hex("#a29bfe")(name) + " " + c.gray("(" + num + ")") : c.hex("#a29bfe")(num);
  var listenRaw = global.GoatBot.config.listen && global.GoatBot.config.listen.listenRawMsg;
  var threadName = "";
  if (event.isGroup && event.threadID) {
    try {
      var tData = await global.GoatBot.DB.threadsData.get(event.threadID);
      if (tData && tData.threadName) {
        threadName = tData.threadName;
      }
    } catch (_) {}
  }
  var tid = (event.threadID || "").split("@")[0];
  var groupLabel = threadName? threadName + " (" + tid + ")" : tid;
  if (listenRaw) {
    var where = event.isGroup? c.hex("#74b9ff")(groupLabel) : c.hex("#fd79a8")("DM");
    var body = (event.body || "").trim().slice(0, 100);
    global.log.info("MSG", who + " [" + where + "]" + (body? ": " + c.hex("#e6e9f0")(body) : c.gray(" (media)")));
  } else {
    var where2 = event.isGroup? c.hex("#74b9ff")(groupLabel) : c.hex("#fd79a8")("DM");
    global.log.info("RCV", who + " → " + where2);
  }
}

async function handlerEvent(api, event) {
  if (!event) return;
  if (event.type === "stop_listen" || event.type === "ready") return;

  if (event.type === "event" || event.type === "group_update" || event.type === "group_join_request") {
    if (event.type === "group_update" && event.logMessageType === "log:thread-name") {
      try {
        var thread = await global.GoatBot.DB.threadsData(event.threadID);
        if (thread && event.logMessageData && event.logMessageData.value && thread.threadName!== event.logMessageData.value) {
          await global.GoatBot.DB.threads.set(event.threadID, event.logMessageData.value, "threadName");
        }
      } catch (_) {}
    }
    var allowed = await handlerAction(api, event).catch(function() { return false; });
    return runEvents(api, event, allowed);
  }

  if (event.type === "message_reaction") {
    if (!event.senderID) {
      event.senderID = event.fromMe? (api.getCurrentUserID? api.getCurrentUserID() : "") : event.threadID;
    }
    if (!event.author) {
      event.author = event.senderID;
    }
    var c = global.utils.colors;
    var num = normUID(event.senderID);
    var emoji = event.emoji || "(removed)";
    var reactionId = event.reactionKey && event.reactionKey.id? event.reactionKey.id : "?";
    global.log.info("REACT", c.hex("#fd79a8")(emoji) + " " + c.gray("by") + " " + c.hex("#a29bfe")(num) + c.gray(" on msg " + reactionId.slice(0, 8)));
    var allowed2 = await handlerAction(api, event).catch(function() { return false; });
    if (!allowed2) return;
    var msgKey = event.reactionKey && event.reactionKey.id;
    if (msgKey && global.GoatBot.onReaction.has(msgKey)) {
      var handler = global.GoatBot.onReaction.get(msgKey);
      var cmd = global.GoatBot.cmds.get((handler.commandName || "").toLowerCase());
      if (cmd && typeof cmd.onReaction === "function") {
        try {
          var message = global.buildMessage(api, event);
          await cmd.onReaction({
            api: api,
            event: event,
            Reaction: handler,
            message: message,
            threadsData: global.GoatBot.DB.threadsData,
            userData: global.GoatBot.DB.userData
          });
        } catch (e) {
          global.log.err("REACTION", e.message);
        }
      }
    }
    return;
  }

  if (event.type!== "message") return;

  if (!event.messageReply && event.replyToMessage) event.messageReply = event.replyToMessage;
  if (!event.replyToMessage && event.messageReply) event.replyToMessage = event.messageReply;

  await handleCheckData(api, event).catch(function() {});

  logIncoming(event).catch(function() {});

  var allowed3 = await handlerAction(api, event).catch(function() { return false; });
  if (!allowed3) return;

  var prefix = await global.getThreadPrefix(event.threadID);
  var body = (event.body || "").trim();
  var args = body.split(/\s+/).filter(Boolean);
  var message2 = global.buildMessage(api, event);

  if (event.senderID) {
    for (var _iterator = global.GoatBot.cmds.entries(), _step;!(_step = _iterator.next()).done;) {
      var _pair = _step.value;
      var cmdNameLoop = _pair[0];
      var cmdLoop = _pair[1];
      if (typeof cmdLoop.onChat === "function") {
        try {
          var handled = await cmdLoop.onChat({
            api: api,
            event: event,
            args: args,
            message: message2,
            prefix: prefix,
            commandName: cmdNameLoop,
            threadsData: global.GoatBot.DB.threadsData,
            userData: global.GoatBot.DB.userData
          });
          if (handled === true) return;
        } catch (e2) {
          global.log.err("ONCHAT", "[" + cmdNameLoop + "] " + e2.message);
        }
      }
    }
  }

  var replied = event.messageReply || event.replyToMessage;
  if (replied) {
    event.messageReply = replied;
    event.replyToMessage = replied;
    var replyID = replied.messageID || replied.messageId;
    if (replyID && global.GoatBot.onReply.has(replyID)) {
      var handler2 = global.GoatBot.onReply.get(replyID);
      var cmd2 = global.GoatBot.cmds.get((handler2.commandName || "").toLowerCase());
      if (cmd2 && typeof cmd2.onReply === "function") {
        try {
          await cmd2.onReply({
            api: api,
            event: event,
            Reply: handler2,
            args: args,
            message: message2,
            threadsData: global.GoatBot.DB.threadsData,
            userData: global.GoatBot.DB.userData,
            usersData: global.GoatBot.DB.userData
          });
        } catch (e3) {
          global.log.err("REPLY", "[" + handler2.commandName + "] " + e3.message);
        }
      }
      return;
    }
  }

  if (!body.startsWith(prefix)) return;

  var afterPrefix = body.slice(prefix.length).trim();
  if (!afterPrefix) {
    return message2.reply("❌ Type `" + prefix + "help` to see all available commands.").catch(function() {});
  }

  var cmdName;
  var cmdArgs;
  if (args[0] === prefix) {
    cmdName = args[1].toLowerCase();
    cmdArgs = args.slice(2);
  } else {
    cmdName = args[0].slice(prefix.length).toLowerCase();
    cmdArgs = args.slice(1);
  }

  var cmdMain = global.GoatBot.cmds.get(cmdName);
  if (!cmdMain) {
    for (var _iterator2 = global.GoatBot.cmds.entries(), _step2;!(_step2 = _iterator2.next()).done;) {
      var val = _step2.value[1];
      if (val.config && Array.isArray(val.config.aliases) && val.config.aliases.map(function(a) { return String(a).toLowerCase(); }).includes(cmdName)) {
        cmdMain = val;
        break;
      }
    }
  }

  if (!cmdMain) {
    return message2.reply("❓ Command `" + prefix + cmdName + "` not found.\nType `" + prefix + "help` to see all available commands.").catch(function() {});
  }

  var adminList = global.GoatBot.config.adminBot || [];
  var isAdmin = isAdminUID(event.senderID, adminList);
  var isGroup = event.isGroup || (event.threadID && event.threadID.endsWith("@g.us"));
  var isGroupAdmin = false;
  var thread2 = null;

  if (isGroup) {
    try {
      var threadsData = global.GoatBot.DB.threadsData;
      thread2 = await threadsData.get(event.threadID);
      isGroupAdmin = thread2 && thread2.adminIDs && thread2.adminIDs.includes(event.senderID);
      if (thread2 && thread2.data && thread2.data.adminOnly) {
        if (!isAdmin &&!isGroupAdmin) {
          var ignoreBoxList = Array.isArray(thread2.data.ignoreCommanToOnlyAdminBox)? thread2.data.ignoreCommanToOnlyAdminBox : [];
          if (!ignoreBoxList.includes(cmdName) &&!ignoreBoxList.includes(cmdMain.config.name)) {
            return message2.reply("⛔ This group is currently enabled only *group administrators* can use the bot").catch(function() {});
          }
        }
      }
    } catch (_) {}
  }

  var role = cmdMain.config.role || 0;
  if (isGroup && thread2 && thread2.data && thread2.data.setRole && thread2.data.setRole[cmdMain.config.name]!== undefined) {
    role = thread2.data.setRole[cmdMain.config.name];
  }

  if (role === 1) {
    if (!isAdmin &&!isGroupAdmin) {
      return message2.reply("❌ | Only *group administrators* can use the command").catch(function() {});
    }
  } else if (role >= 2) {
    if (!isAdmin) {
      return message2.reply("❌ | Only bot *owner* can use the command").catch(function() {});
    }
  }

  var cdKey = cmdName + ":" + normUID(event.senderID);
  var countDownSec = cmdMain.config.countDown || 0;
  if (isGroup && thread2 && thread2.data && thread2.data.setCooldown && thread2.data.setCooldown[cmdMain.config.name]!== undefined) {
    countDownSec = thread2.data.setCooldown[cmdMain.config.name];
  }
  var countDown = countDownSec * 1000;
  if (countDown > 0) {
    var lastUsed = global.GoatBot._cooldowns.get(cdKey) || 0;
    var diff = Date.now() - lastUsed;
    if (diff < countDown) {
      var remaining = ((countDown - diff) / 1000).toFixed(1);
      return message2.reply("⏳ Wait " + remaining + "s before using this again.").catch(function() {});
    }
  }

  if (typeof cmdMain.onStart!== "function") return;

  var c2 = global.utils.colors;
  var senderNum = normUID(event.senderID);
  var senderName = await global.getDisplayName(event.senderID);
  var who2 = senderName!== senderNum? c2.hex("#a29bfe")(senderName) + " " + c2.gray("(" + senderNum + ")") : c2.yellowBright(senderNum);
  var cmdStr = c2.cyanBright(prefix + cmdName) + (cmdArgs.length? " " + cmdArgs.join(" ") : "");
  global.log.cmd("CMD", who2 + " → " + cmdStr);

  var senderRole = isAdmin? 2 : isGroupAdmin? 1 : 0;

  try {
    var minDelay = 2000;
    var maxDelay = 4000;
    var randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    await api.sendTypingIndicator(event.threadID, randomDelay).catch(function() {});
    await new Promise(function(r) { return setTimeout(r, randomDelay); });
  } catch (_) {}

  try {
    global.GoatBot._cooldowns.set(cdKey, Date.now());
    await cmdMain.onStart({
      api: api,
      event: event,
      args: cmdArgs,
      message: message2,
      prefix: prefix,
      threadsData: global.GoatBot.DB.threadsData,
      userData: global.GoatBot.DB.userData,
      usersData: global.GoatBot.DB.userData,
      commandName: cmdName,
      envCommands: (global.GoatBot && global.GoatBot.configCommands && global.GoatBot.configCommands.envCommands) || {},
      getLang: function(key) {
        var replaceArgs = Array.prototype.slice.call(arguments, 1);
        var langCode = (global.GoatBot && global.GoatBot.config && global.GoatBot.config.language) || "en";
        var val = (cmdMain.langs && cmdMain.langs[langCode] && cmdMain.langs[langCode][key]) || (cmdMain.langs && cmdMain.langs["en"] && cmdMain.langs["en"][key]) || key;
        replaceArgs.forEach(function(arg, i) {
          val = val.replace(new RegExp("%" + (i + 1), "g"), String(arg));
        });
        return val;
      },
      role: senderRole
    });
    global.log.success("CMD", c2.cyanBright(prefix + cmdName) + " " + c2.gray("← done ✓"));
  } catch (e4) {
    global.log.err("CMD", "[" + cmdName + "] " + e4.message);
    try {
      await message2.reply("❌ Error: " + e4.message);
    } catch (_) {}
  }
}

async function runEvents(api, event, allowed) {
  if (allowed === undefined) allowed = true;
  for (var _iterator3 = global.GoatBot.events.entries(), _step3;!(_step3 = _iterator3.next()).done;) {
    var evt = _step3.value[1];
    if (!allowed && evt.config.allowUnwhitelisted!== true) continue;
    try {
      if (typeof evt.onStart === "function") {
        await evt.onStart({
          api: api,
          event: event,
          threadsData: global.GoatBot.DB.threadsData,
          userData: global.GoatBot.DB.userData,
          usersData: global.GoatBot.DB.userData
        });
      }
      if (typeof evt.onEvent === "function") {
        await evt.onEvent({
          api: api,
          event: event,
          threadsData: global.GoatBot.DB.threadsData,
          userData: global.GoatBot.DB.userData,
          usersData: global.GoatBot.DB.userData
        });
      }
    } catch (_) {}
  }
}

module.exports = handlerEvent;

require("./config")
const fs = require("fs");
const path = require("path");
const { smsg, getGroupAdmins } = require("./lib/serialize");
const print = require("./lib/print");
const { consoleError } = require("./lib/console");

class CommandRegistry {
    constructor() {
        this.commands = new Map();
        this.eventHandlers = [];
        this.playgroundDir = path.join(__dirname, "playground");
        this.pluginsDir = path.join(this.playgroundDir, "plugins");
        this.caseFile = path.join(this.playgroundDir, "case", "case.js");

        this.ensureDirectories();
    }

    /**
     * Ensure required directories exist
     */
    ensureDirectories() {
        if (!fs.existsSync(this.playgroundDir)) {
            fs.mkdirSync(this.playgroundDir);
        }

        if (!fs.existsSync(this.pluginsDir)) {
            fs.mkdirSync(this.pluginsDir, { recursive: true });
        }
    }

    /**
     * Load all plugins and commands
     */
    loadCommands() {
        this.loadPluginsFromDirectory(this.pluginsDir);

        try {
            this.caseHandler = require(this.caseFile);
            console.log("Case handler loaded successfully");
        } catch (error) {
            console.log("No case handler found or error loading it");
            this.caseHandler = null;
        }

        console.log(`Loaded ${this.commands.size} commands and ${this.eventHandlers.length} event handlers`);
    }

    /**
     * Recursively load plugins from a directory
     * @param {string} dir - Directory to scan
     */
    loadPluginsFromDirectory(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });

        for (const file of files) {
            const filePath = path.join(dir, file.name);

            if (file.isDirectory()) {
                this.loadPluginsFromDirectory(filePath);
            } else if (file.name.endsWith('.js')) {
                this.loadPluginFile(filePath);
            }
        }
    }

    /**
     * Load a single plugin file
     * @param {string} filePath - Path to plugin file
     */
    loadPluginFile(filePath) {
        try {
            const fileName = path.basename(filePath);
            const plugin = require(filePath);

            if (!plugin.run) return;

            if (fileName.startsWith("_") && plugin.run.main) {
                this.eventHandlers.push(plugin.run);
                console.log(`Loaded event plugin: ${fileName}`);
                return;
            }

            if (plugin.run.name) {
                this.commands.set(plugin.run.name, plugin.run);
                console.log(`Loaded plugin: ${plugin.run.name}`);
                if (plugin.run.alias && Array.isArray(plugin.run.alias)) {
                    for (const alias of plugin.run.alias) {
                        if (alias instanceof RegExp) continue;
                        this.commands.set(alias, plugin.run);
                    }
                }
            }
        } catch (error) {
            console.error(`Error loading plugin ${filePath}:`, error);
        }
    }

    /**
     * Handle a message
     * @param {Object} m - Serialized message
     * @param {Object} conn - WhatsApp connection
     * @param {Object} store - Message store
     * @param {Object} chatUpdate - Chat update object
     */
    async handleMessage(m, conn, store, chatUpdate) {
        if (!m || m.fromMe) return;

        try {
            await this.processEventPlugins(m, conn, store, chatUpdate);
            print(m, conn);
            if (!m.body) return;

            const botNumber = await conn.decodeJid(conn.user.id);
            const groupMetadata = m.isGroup ? await conn.groupMetadata(m.key.remoteJid).catch(e => { }) : '';
            const participants = m.isGroup ? await groupMetadata.participants : '';
            const groupAdmins = m.isGroup ? getGroupAdmins(participants) : '';
            const isAdmin = m.isGroup ? groupAdmins.includes(m.sender) : false;
            const isOwner = [botNumber, ...global.owner].map(v => v.replace(/[^0-9]/g, '') + "@s.whatsapp.net").includes(m.sender);

            if (global.prefix.test(m.body)) {
                const args = m.body.slice(prefix.length).trim().split(" ");
                const command = args.shift().toLowerCase();
                const text = args.join(" ");

                if (this.commands.has(command)) {
                    const plugin = this.commands.get(command);
                    return plugin.exec(m, {
                        conn,
                        text,
                        args,
                        isAdmin,
                        isOwner
                    });
                }

                if (this.caseHandler) {
                    return this.caseHandler(m, conn, chatUpdate);
                }

                return;
            }

            const msgLower = m.body.toLowerCase();
            for (const [key, plugin] of this.commands.entries()) {
                if (!plugin.noPrefix) continue;
                if (msgLower === key.toLowerCase()) {
                    return plugin.exec(m, {
                        conn,
                        text: m.body,
                        args: m.body.split(" "),
                        isAdmin,
                        isOwner
                    });
                }

                if (plugin.alias && Array.isArray(plugin.alias)) {
                    for (const alias of plugin.alias) {
                        if (alias instanceof RegExp && alias.test(msgLower)) {
                            return plugin.exec(m, {
                                conn,
                                text: m.body,
                                args: m.body.split(" "),
                                isAdmin,
                                isOwner
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error handling message:", error);
        }
    }

    /**
     * Process all event plugins
     * @param {Object} m - Message object
     * @param {Object} conn - WhatsApp connection
     * @param {Object} store - Message store
     * @param {Object} chatUpdate - Chat update object
     */
    async processEventPlugins(m, conn, store, chatUpdate) {
        const groupMetadata = m.isGroup ? await conn.groupMetadata(m.chat) : null;
        const participants = m.isGroup ? groupMetadata.participants : [];

        const isAdmin = m.isGroup ? participants.find(p => p.id === m.sender)?.admin !== false : false;
        const isBotAdmin = m.isGroup ? participants.find(p => p.id === conn.user.id)?.admin !== false : false;

        for (const handler of this.eventHandlers) {
            try {
                await handler.main(m, {
                    conn,
                    isAdmin,
                    isBotAdmin,
                    store,
                    chatUpdate
                });
            } catch (error) {
                console.error("Error in event plugin:", error);
            }
        }
    }
}

const registry = new CommandRegistry();
registry.loadCommands();

/**
 * Main handler function
 * @param {Object} conn - WhatsApp connection
 * @param {Object} msg - Raw message
 * @param {Object} store - Message store
 * @param {Object} chatUpdate - Chat update object
 */
async function handler(conn, msg, store, chatUpdate) {
    const m = smsg(conn, msg, store);
    if (m) {
        try {
            const botNumber = await conn.decodeJid(conn.user.id);
            let isNumber = x => typeof x === 'number' && !isNaN(x)
            if (global.db.data == null) await loadDatabase();
            let user = global.db.data.users[m.sender]
            if (typeof user !== "object") global.db.data.users = {}
            if (user) {
                if (!("banned" in user)) user.banned = false;
                if (!isNumber(user.bannedDate)) user.bannedDate = 0;
                if (!isNumber(user.limit)) user.limit = 100; // atur limit
                if (!("premium" in user)) user.premium = false;
                if (!isNumber(user.premiumDate)) user.premiumDate = 0;
                if (!isNumber(user.warn)) user.warn = 0;
            } else global.db.data.users[m.sender] = {
                banned: false,
                bannedDate: 0,
                limit: 100, // atur limit
                premium: false,
                premiumDate: 0,
                warn: 0
            }
            let settings = global.db.data.settings[botNumber]
            if (typeof settings !== 'object') global.db.data.settings[botNumber] = {}
            if (settings) {
                if (!('self' in settings)) settings.self = false
                if (!('autoread' in settings)) settings.autoread = false
                if (!('composing' in settings)) settings.composing = true
                if (!('restrict' in settings)) settings.restrict = true
                if (!('autorestart' in settings)) settings.autorestart = true
                if (!('gconly' in settings)) settings.gconly = true
                if (!('restartDB' in settings)) settings.restartDB = 0
                if (!isNumber(settings.status)) settings.status = 0 // ini buat data set Status, tambah disini
                if (!('anticall' in settings)) settings.anticall = true
                if (!('clear' in settings)) settings.clear = true
                if (!isNumber(settings.clearTime)) settings.clearTime = 0
                if (!('freply' in settings)) settings.freply = true
                if (!('akinator' in settings)) settings.akinator = {}
            } else global.db.data.settings[botNumber] = {
                self: false,
                autoread: false,
                restrict: true,
                autorestart: true,
                composing: true,
                restartDB: 0,
                gconly: true,
                status: 0, // disini juga,
                anticall: true, // anticall on apa off?
                clear: true,
                clearTime: 0,
                freply: true,
                akinator: {}
            }
            let chat = global.db.data.chats[m.chat]
            if (typeof chat !== 'object') global.db.data.chats[m.chat] = {}
            if (chat) {
                if (!('isBanned' in chat)) chat.isBanned = false
                if (!('welcome' in chat)) chat.welcome = true
                if (!('autoread' in chat)) chat.autoread = false
                if (!('detect' in chat)) chat.detect = false
                if (!('delete' in chat)) chat.delete = true
                if (!('antiVirtex' in chat)) chat.antiVirtex = false
                if (!('antiLink' in chat)) chat.antiLink = false
                if (!('tikauto' in chat)) chat.tikauto = false
                if (!('captcha' in chat)) chat.captcha = false
                if (!('antifoto' in chat)) chat.antiFoto = false
                if (!('antividio' in chat)) chat.antiVideo = false
                if (!('autoJpm' in chat)) chat.autoJpm = false
                if (!('antiPorn' in chat)) chat.antiPorn = false
                if (!('antiBot' in chat)) chat.antiBot = true
                if (!('antiSpam' in chat)) chat.antiSpam = false
                if (!('freply' in chat)) chat.freply = false
                if (!('simi' in chat)) chat.simi = false
                if (!('ai' in chat)) chat.ai = false
                if (!('ngetik' in chat)) chat.ngetik = false
                if (!('autoVn' in chat)) chat.autoVn = false
                if (!('antiSticker' in chat)) chat.antiSticker = false
                if (!('stiker' in chat)) chat.stiker = false
                if (!('antiBadword' in chat)) chat.antiBadword = false
                if (!('viewonce' in chat)) chat.viewonce = false
                if (!('useDocument' in chat)) chat.useDocument = false
                if (!('antiToxic' in chat)) chat.antiToxic = false
                if (!isNumber(chat.expired)) chat.expired = 0
            } else global.db.data.chats[m.chat] = {
                isBanned: false,
                welcome: true,
                autoread: false,
                simi: false,
                ai: false,
                ngetik: false,
                autoVn: false,
                stiker: false,
                antiSticker: false,
                antiBadword: false,
                antiSpam: false,
                antiBot: true,
                detect: false,
                autoJpm: false,
                delete: true,
                antiLink: false,
                tikauto: false,
                captcha: false,
                antifoto: false,
                antividio: false,
                antiPorn: false
            }
        } catch (e) {
            consoleError(e)
        }
        registry.handleMessage(m, conn, store, chatUpdate);
    }
}

module.exports = handler;
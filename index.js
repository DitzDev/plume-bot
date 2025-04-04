/**
 * WhatsApp Bot Main Entry Point
 */
require("./config");
const { Boom } = require("@hapi/boom");
const {
    default: makeWASocket,
    Browsers,
    useMultiFileAuthState,
    DisconnectReason,
    makeInMemoryStore,
    jidDecode
} = require("baileys");
const PhoneNumber = require("awesome-phonenumber")
const chalk = require("chalk");
const _ = require("lodash");
const pino = require("pino");
const readline = require("readline");
const CFont = require("cfonts");
const {
    startLoading,
    done,
    consoleInfo,
    consoleSuccess,
    consoleError,
    doneError
} = require("./lib/console");
const handler = require("./handler");
const yargs = require("yargs");
const pairingCode = true;

CFont.say("Plume", {
    font: "3d",
    align: "left",
    colors: ["yellowBright", "cyan"]
});

const store = makeInMemoryStore({
    logger: pino().child({ level: "silent", stream: "store" })
});

/**
 * Ask for phone number with validation
 * @param {string} question - Prompt text
 * @returns {Promise<string>} - Valid phone number
 */
function askPhoneNumber(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        const ask = () => {
            rl.question(question, (input) => {
                const cleanedInput = input.replace(/\D/g, '');
                const isValid = /^\d{8,15}$/.test(cleanedInput);

                if (isValid) {
                    rl.close();
                    resolve(cleanedInput);
                } else {
                    console.log('Invalid phone number format. Must contain 8-15 digits, no spaces or symbols.');
                    ask();
                }
            });
        };
        ask();
    });
}

var low
try {
    low = require('lowdb')
} catch (e) {
    low = require('./lib/lowdb')
}

const {
    Low,
    JSONFile
} = low
const mongoDB = require('./lib/mongoDB');
const { console } = require("inspector/promises");
const { checkForUpdates } = require("./lib/update-checker");


global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.prefix = new RegExp('^[' + (opts['prefix'] || '芒鈧絰zXZ/i!#$%+脗拢脗垄芒鈥毬偮脗掳=脗露芒藛鈥犆冣€斆兟访忊偓芒藛拧芒艙鈥溍偮┟偮�:;?&.\\-').replace(/[|\\{}()[\]^$+*?.\-\^]/g, '\\$&') + ']')

global.db = new Low(
    /https?:\/\//.test(opts['db'] || '') ?
        new cloudDBAdapter(opts['db']) : /mongodb/.test(opts['db']) ?
            new mongoDB(opts['db']) :
            new JSONFile(`database.json`)
)

global.DATABASE = global.db
global.loadDatabase = async function loadDatabase() {
    if (global.db.READ) return new Promise((resolve) => setInterval(function () {
        (!global.db.READ ? (clearInterval(this), resolve(global.db.data == null ? global.loadDatabase() : global.db.data)) : null)
    }, 1 * 1000))
    if (global.db.data !== null) return
    global.db.READ = true
    await global.db.read()
    global.db.READ = false
    global.db.data = {
        users: {},
        chats: {},
        settings: {},
        ...(global.db.data || {})
    }
    global.db.chain = _.chain(global.db.data)
}

loadDatabase();

if (global.db) setInterval(async () => {
    if (global.db.data) await global.db.write()
}, 10 * 1000)


/**
 * Connect to WhatsApp
 */
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionName);
    const conn = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !pairingCode,
        auth: state,
        browser: Browsers.macOS("Safari")
    });

    if (pairingCode && !conn.authState.creds.registered) {
        const phoneNumber = await askPhoneNumber(
            chalk.yellowBright("[!] Masukan nomor telepon WhatsApp di awali dengan 628xx: ")
        );
        const code = await conn.requestPairingCode(phoneNumber);
        console.log(
            chalk.bgGreen(chalk.black("Your Pairing Code")),
            chalk.green(code.slice(0, 4) + "-" + code.slice(4))
        );
    }

    conn.ev.on("creds.update", saveCreds);

    conn.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        startLoading("Mendeteksi koneksi...");

        if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;

            switch (reason) {
                case DisconnectReason.badSession:
                    doneError("Sesi buruk, Harap hapus folder sesi lalu jalankan ulang script ini.");
                    process.exit();
                    break;

                case DisconnectReason.connectionClosed:
                    consoleInfo("Koneksi tertutup, Mencoba menyambung ulang...");
                    connectToWhatsApp();
                    break;

                case DisconnectReason.connectionLost:
                    consoleInfo("Koneksi tiba-tiba menghilang dari server, Mencoba menyambung ulang...");
                    connectToWhatsApp();
                    break;

                case DisconnectReason.connectionReplaced:
                    doneError("Koneksi Tertimpa, Sesi lainnya sedang terbuka, Mohon untuk merestart script dan coba lagi.");
                    process.exit();
                    break;

                case DisconnectReason.loggedOut:
                    doneError("Sesi telah ter log out, Harap hapus folder sesi dan jalankan lagi script ini.");
                    process.exit();
                    break;

                case DisconnectReason.restartRequired:
                    consoleInfo("Restart di butuhkan, Mencoba merestart...");
                    connectToWhatsApp();
                    break;

                case DisconnectReason.timedOut:
                    consoleInfo("Koneksi time out, Mencoba menyambung ulang...");
                    connectToWhatsApp();
                    break;

                default:
                    consoleError("Koneksi tidak di ketahui...");
                    connectToWhatsApp();
                    break;
            }
        } else if (connection === "open") {
            done("Koneksi berhasil terhubung, Selamat datang Owner!");
        }
    });

    conn.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            if (!chatUpdate.messages) return;
            const msg = chatUpdate.messages[0];
            if (!msg.message) return;
            if (msg.key && msg.key.remoteJid === "status@broadcast") return;

            handler(conn, msg, store, chatUpdate);
        } catch (err) {
            console.error("Error handling message:", err);
        }
    });

    conn.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return decode.user && decode.server && decode.user + '@' + decode.server || jid;
        }
        return jid;
    };

    conn.sendText = (jid, text, quoted = '', options = {}) => {
        return conn.sendMessage(jid, { text: text, ...options }, { quoted, ...options });
    };

    conn.getName = (jid, withoutContact = false) => {
        id = conn.decodeJid(jid)
        withoutContact = conn.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = conn.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === conn.decodeJid(conn.user.id) ?
            conn.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    return conn;
}

async function startBot() {
    const shouldContinue = await checkForUpdates('DitzDev', 'plume-bot');

    if (shouldContinue) {
        connectToWhatsApp();
    } else {
        consoleInfo(chalk.yellow('Program paused due to pending update. Please update first or restart with --no-update flag to skip.'));
        if (process.argv.includes('--no-update')) {
            consoleInfo(chalk.yellow('Continuing without update as requested...'));
            connectToWhatsApp();
        }
    }
}

startBot();
const Spinnies = require('spinnies');
const chalk = require('chalk');

const spinnies = new Spinnies();

/**
 * @param {string} text - Text of loading text
 */
function startLoading(text) {
    const spinnerId = 'loading';
    spinnies.add(spinnerId, { text: chalk.blue(text) });
}

function done(reason = "Done!") {
    spinnies.succeed('loading', { text: chalk.green(reason) });
}

function doneError(reason = "An Error Ocourred...") {
    spinnies.fail('loading', { text: chalk.redBright(reason) })
}

/** @param {string} text */
function consoleInfo(text) {
    console.log(chalk.blue("[ INFO ] "), chalk.blue(text))
}

/** @param {string} text */
function consoleError(text) {
    console.log(chalk.red("[ ERROR ] "), chalk.red(text))
}

/** @param {string} text */
function consoleSuccess(text) {
    console.log(chalk.green("[ SUCCESS ] "), chalk.green(text))
}

module.exports = { startLoading, done, consoleInfo, consoleError, consoleSuccess, doneError };

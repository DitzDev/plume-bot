const fs = require('fs');
const path = require('path');
const axios = require('axios');
const readline = require('readline');
const { execSync } = require('child_process');
const { createWriteStream } = require('fs');
const { Extract } = require('unzipper');
const { consoleError, consoleInfo, consoleSuccess, startLoading, doneError, done } = require('./console');

/**
 * Compares version strings
 * @param {string} v1 - Version 1
 * @param {string} v2 - Version 2
 * @returns {number} - 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
    const v1Parts = v1.replace('v', '').split('.').map(Number);
    const v2Parts = v2.replace('v', '').split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;

        if (v1Part > v2Part) return 1;
        if (v1Part < v2Part) return -1;
    }

    return 0;
}

/**
 * Ask a yes/no question
 * @param {string} question - Question to ask
 * @returns {Promise<boolean>} - True for yes, false for no
 */
function askYesNoQuestion(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            const normalizedAnswer = answer.toLowerCase().trim();
            resolve(['y', 'yes', ''].includes(normalizedAnswer));
        });
    });
}

/**
 * Download file from URL
 * @param {string} url - URL to download from
 * @param {string} outputPath - Path to save the file
 * @returns {Promise<void>}
 */
async function downloadFile(url, outputPath) {
    const writer = createWriteStream(outputPath);

    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

/**
 * Extract ZIP file
 * @param {string} zipPath - Path to the ZIP file
 * @param {string} extractPath - Path to extract to
 * @returns {Promise<void>}
 */
async function extractZip(zipPath, extractPath) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(zipPath)
            .pipe(Extract({ path: extractPath }))
            .on('close', resolve)
            .on('error', reject);
    });
}

/**
 * Check for updates and prompt for installation
 * @param {string} repoOwner - GitHub repository owner
 * @param {string} repoName - GitHub repository name
 * @returns {Promise<boolean>} - True if update was installed or no update needed, false if update available but skipped
 */
async function checkForUpdates(repoOwner, repoName) {
    try {
        startLoading('🔍 Checking for updates...');

        const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
        const currentVersion = packageJson.version;

        const githubApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;
        const response = await axios.get(githubApiUrl);

        if (!response.data || !response.data.tag_name) {
            consoleInfo('✅ No releases found or unable to check for updates.');
            return true;
        }

        const latestVersion = response.data.tag_name.replace('v', '');

        if (compareVersions(latestVersion, currentVersion) > 0) {
            done("Update detected.")
            consoleInfo(`\n🔄 Update version ${latestVersion} available!`);
            consoleInfo(`Current version: ${currentVersion}`);
            consoleInfo(`Latest version: ${latestVersion}`);

            const shouldUpdate = await askYesNoQuestion(
                `${latestVersion} version update is available, It is recommended to update the script first for latest feature, Install update? [Y/n]: `
            );

            if (shouldUpdate) {
                startLoading('\n📥 Downloading update...');

                const zipAsset = response.data.assets.find(asset => asset.name.endsWith('.zip'));

                if (!zipAsset) {
                    doneError('❌ No ZIP file found in the release.');
                    return false;
                }

                const downloadUrl = zipAsset.browser_download_url;
                const updateDirName = `update-v${latestVersion}`;
                const updateDir = path.join(process.cwd(), updateDirName);
                const zipPath = path.join(process.cwd(), `${updateDirName}.zip`);

                if (!fs.existsSync(updateDir)) {
                    fs.mkdirSync(updateDir, { recursive: true });
                }

                await downloadFile(downloadUrl, zipPath);
                consoleSuccess('✅ Download completed.');

                consoleInfo('📦 Extracting update...');
                await extractZip(zipPath, updateDir);
                consoleSuccess('✅ Extraction completed.');
                done("All update completed");

                fs.unlinkSync(zipPath);

                consoleInfo(`\n✅ Update downloaded to ${updateDirName} folder.`);
                consoleInfo('Please install the update manually by copying the files from the update folder.');

                return true;
            } else {
                consoleInfo('⏭️ Update skipped. Continuing with current version.');
                done("Update skipped...")
                return false;
            }
        } else {
            done('✅ You are using the latest version.');
            return true;
        }
    } catch (error) {
        doneError('❌ Error checking for updates:', error.message);
        return true;
    }
}

module.exports = { checkForUpdates };
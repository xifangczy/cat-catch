const fs = require('fs');
const path = require('path');

// Paths
const localesDir = path.join(__dirname, '../_locales');
const enFile = path.join(localesDir, 'en/messages.json');

// Read and parse JSON file
function readJsonFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return null;
    }
}

// Write JSON file with 2-space indentation
function writeJsonFile(filePath, data) {
    try {
        const content = JSON.stringify(data, null, 2) + '\n';
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
        return true;
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error);
        return false;
    }
}

// Get all locale directories except 'en'
function getLocaleDirs() {
    return fs.readdirSync(localesDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name !== 'en')
        .map(dirent => dirent.name);
}

// Main function to sync locale files
function syncLocales() {
    // Read English file as baseline
    const enMessages = readJsonFile(enFile);
    if (!enMessages) return;

    // Get all locale directories
    const locales = getLocaleDirs();

    // Process each locale
    locales.forEach(locale => {
        const localeFile = path.join(localesDir, locale, 'messages.json');
        const localeMessages = readJsonFile(localeFile) || {};
        const syncedMessages = {};
        let added = 0;
        let removed = 0;

        // Create new messages object with English key order
        Object.keys(enMessages).forEach(key => {
            if (localeMessages[key]) {
                // Use existing translation
                syncedMessages[key] = localeMessages[key];
            } else {
                // Add English message as placeholder
                syncedMessages[key] = enMessages[key];
                added++;
            }
        });

        // Count removed keys (present in locale but not in English)
        removed = Object.keys(localeMessages).length - (Object.keys(syncedMessages).length - added);

        // Write the synchronized file
        if (writeJsonFile(localeFile, syncedMessages)) {
            console.log(`Synced ${locale}: ${added} added, ${removed} removed`);
        }
    });
}

// Run the synchronization
console.log('Starting locale synchronization...');
syncLocales();
console.log('Locale synchronization complete!');

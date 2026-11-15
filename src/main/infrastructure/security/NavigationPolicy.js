const path = require('path');
const { pathToFileURL } = require('url');

const applicationUrl = pathToFileURL(path.join(__dirname, '../../../renderer/index.html')).href;

function isApplicationUrl(url) {
    return url === applicationUrl;
}

function externalHttpUrl(value) {
    if (typeof value !== 'string' || Array.from(value).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null;
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
        return url.href;
    } catch {
        return null;
    }
}

module.exports = { isApplicationUrl, externalHttpUrl };

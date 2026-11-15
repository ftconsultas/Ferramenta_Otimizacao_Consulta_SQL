const fs = require('fs');
const path = require('path');
const os = require('os');
const { validateConnectionConfig } = require('./ConnectionConfig');

let safeStorage = null;
let app = null;
try {
    const electron = require('electron');
    safeStorage = electron.safeStorage;
    app = electron.app;
} catch {
    // Execução via CLI sem Electron
}

function requireSecureStorage() {
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
        throw new Error('Criptografia nativa não disponível neste sistema.');
    }
    if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
        throw new Error('Configure um chaveiro seguro do sistema para armazenar credenciais.');
    }
}

/**
 * CredentialManager
 * Gerencia o armazenamento seguro de credenciais usando criptografia nativa do SO.
 */
class CredentialManager {
    constructor() {
        if (app && typeof app.getPath === 'function') {
            this.configPath = path.join(app.getPath('userData'), 'db-config.enc');
        } else {
            const baseDir = path.join(os.homedir(), '.gemini', 'antigravity');
            if (!fs.existsSync(baseDir) && typeof fs.mkdirSync === 'function') {
                fs.mkdirSync(baseDir, { recursive: true });
            }
            this.configPath = path.join(baseDir, 'db-config.enc');
        }
    }

    /**
     * Salva as credenciais em disco.
     * @param {Object} config 
     */
    async save(config) {
        requireSecureStorage();
        const validated = validateConnectionConfig(config);

        try {
            const plainText = JSON.stringify(validated);
            const encryptedBuffer = safeStorage.encryptString(plainText);
            fs.writeFileSync(this.configPath, encryptedBuffer, { mode: 0o600 });
            fs.chmodSync(this.configPath, 0o600);
            return true;
        } catch {
            console.error('[CredentialManager] Erro ao salvar credenciais.');
            throw new Error('Falha ao proteger e salvar credenciais.');
        }
    }

    /**
     * Carrega as credenciais do disco.
     * @returns {Object|null}
     */
    async load() {
        if (!fs.existsSync(this.configPath)) return null;
        requireSecureStorage();

        try {
            const encryptedBuffer = fs.readFileSync(this.configPath);
            const decryptedText = safeStorage.decryptString(encryptedBuffer);
            return validateConnectionConfig(JSON.parse(decryptedText));
        } catch {
            console.error('[CredentialManager] Erro ao carregar credenciais.');
            return null;
        }
    }


    /**
     * Remove as credenciais salvas.
     */
    async clear() {
        if (fs.existsSync(this.configPath)) {
            fs.unlinkSync(this.configPath);
        }
    }
}

module.exports = new CredentialManager();

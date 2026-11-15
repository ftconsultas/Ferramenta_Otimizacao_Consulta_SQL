jest.mock('electron', () => ({
    app: { getPath: jest.fn(() => '/application-data/sql-optimizer-test') },
    safeStorage: { isEncryptionAvailable: jest.fn(), getSelectedStorageBackend: jest.fn(), encryptString: jest.fn(), decryptString: jest.fn() }
}));
jest.mock('fs', () => ({ existsSync: jest.fn(), writeFileSync: jest.fn(), readFileSync: jest.fn(), chmodSync: jest.fn(), unlinkSync: jest.fn() }));

const fs = require('fs');
const { safeStorage } = require('electron');
const Credentials = require('../../../src/main/infrastructure/security/CredentialManager');
const config = { sgbd: 'mysql', host: 'localhost', port: 3306, user: 'reader', password: 'private', database: 'tuning_db' };

beforeEach(() => {
    jest.resetAllMocks();
    safeStorage.isEncryptionAvailable.mockReturnValue(true);
    safeStorage.getSelectedStorageBackend.mockReturnValue('gnome_libsecret');
});

it('writes encrypted credentials with owner-only permissions', async () => {
    const encrypted = Buffer.from('encrypted');
    safeStorage.encryptString.mockReturnValue(encrypted);
    await expect(Credentials.save(config)).resolves.toBe(true);
    expect(safeStorage.encryptString).toHaveBeenCalledWith(JSON.stringify(config));
    expect(fs.writeFileSync).toHaveBeenCalledWith(Credentials.configPath, encrypted, { mode: 0o600 });
    expect(fs.chmodSync).toHaveBeenCalledWith(Credentials.configPath, 0o600);
});

it('rejects persistence when encryption is unavailable', async () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(false);
    await expect(Credentials.save(config)).rejects.toThrow('Criptografia nativa');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
});

if (process.platform === 'linux') {
    it('rejects the basic_text backend for reading and writing', async () => {
        fs.existsSync.mockReturnValue(true);
        safeStorage.getSelectedStorageBackend.mockReturnValue('basic_text');
        await expect(Credentials.save(config)).rejects.toThrow('chaveiro seguro');
        await expect(Credentials.load()).rejects.toThrow('chaveiro seguro');
        expect(fs.readFileSync).not.toHaveBeenCalled();
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
}

it('rejects remote credentials before encrypting', async () => {
    await expect(Credentials.save({ ...config, host: 'example.com' })).rejects.toThrow('Apenas conexões');
    expect(safeStorage.encryptString).not.toHaveBeenCalled();
});

it('loads and validates decrypted local credentials', async () => {
    const encrypted = Buffer.from('encrypted');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(encrypted);
    safeStorage.decryptString.mockReturnValue(JSON.stringify(config));
    expect(await Credentials.load()).toEqual(config);
    expect(safeStorage.decryptString).toHaveBeenCalledWith(encrypted);
});

it('returns null without touching the keychain if no configuration exists', async () => {
    fs.existsSync.mockReturnValue(false);
    expect(await Credentials.load()).toBeNull();
    expect(safeStorage.isEncryptionAvailable).not.toHaveBeenCalled();
});

it('does not log decrypted data when the credential file is corrupt', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    fs.existsSync.mockReturnValue(true);
    safeStorage.decryptString.mockReturnValue('{"password":"private",invalid}');
    expect(await Credentials.load()).toBeNull();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('private');
    expect(fs.unlinkSync).not.toHaveBeenCalled();
});

it('returns a generic error if writing the encrypted file fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    safeStorage.encryptString.mockReturnValue(Buffer.from('encrypted'));
    fs.writeFileSync.mockImplementation(() => { throw new Error('Disk failure'); });
    await expect(Credentials.save(config)).rejects.toThrow('Falha ao proteger e salvar credenciais');
});

/** @jest-environment jsdom */

const fs = require('fs');
const path = require('path');
require('../../src/renderer/html-safety');
const listener = jest.spyOn(document, 'addEventListener').mockImplementation(() => {});
require('../../src/renderer/renderer');
listener.mockRestore();
const settingsTemplate = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/pages/settings.html'), 'utf8');
const savedConfig = { sgbd: 'mysql', host: 'localhost', port: 3306, user: 'reader', database: 'tuning_db', hasSavedPassword: true };

async function flushHandlers() {
    for (let index = 0; index < 10; index++) await Promise.resolve();
}

beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(window, 'setTimeout').mockImplementation(() => 0);
    document.body.innerHTML = settingsTemplate;
    window.app.state.activeConfig = null;
    window.app.state.selectedSgbd = 'mysql';
    window.app.state.isConnected = false;
    window.api = {
        getDbConfig: jest.fn().mockResolvedValue(savedConfig),
        testConnection: jest.fn().mockResolvedValue({ status: 'success', message: 'Conexão válida' }),
        saveDbConfig: jest.fn().mockResolvedValue(true)
    };
});

it('starts without an available saved password', () => {
    window.app.initSettings();
    expect(document.getElementById('saved-password-option').hidden).toBe(true);
    expect(document.getElementById('db-pass').disabled).toBe(false);
    expect(window.app.getFormData().useSavedPassword).toBe(false);
});

it('uses saved credentials without filling the password field', () => {
    window.app.state.activeConfig = savedConfig;
    window.app.initSettings();
    expect(document.getElementById('saved-password-option').hidden).toBe(false);
    expect(document.getElementById('db-pass').value).toBe('');
    expect(document.getElementById('db-pass').disabled).toBe(true);
    expect(window.app.getFormData()).toEqual({
        sgbd: 'mysql', host: 'localhost', port: 3306, user: 'reader', database: 'tuning_db',
        password: '', useSavedPassword: true
    });
});

it('allows replacing a saved password, including an intentionally empty password', () => {
    window.app.state.activeConfig = savedConfig;
    window.app.initSettings();
    const checkbox = document.getElementById('use-saved-password');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    expect(document.getElementById('db-pass').disabled).toBe(false);
    expect(window.app.getFormData().password).toBe('');
    expect(window.app.getFormData().useSavedPassword).toBe(false);
    document.getElementById('db-pass').value = 'replacement';
    expect(window.app.getFormData().password).toBe('replacement');
});

it('clears the typed password after saving and keeps only connection metadata in state', async () => {
    window.app.initSettings();
    document.getElementById('db-user').value = 'reader';
    document.getElementById('db-name').value = 'tuning_db';
    document.getElementById('db-pass').value = 'private';
    document.getElementById('save-config-btn').click();
    await flushHandlers();
    expect(window.api.saveDbConfig).toHaveBeenCalledWith(expect.objectContaining({ password: 'private', useSavedPassword: false }));
    expect(window.app.state.activeConfig).toEqual(savedConfig);
    expect(window.app.state.activeConfig).not.toHaveProperty('password');
    expect(document.getElementById('db-pass').value).toBe('');
    expect(document.getElementById('use-saved-password').checked).toBe(true);
    expect(document.getElementById('save-config-btn').disabled).toBe(false);
});

it('connects using the saved password without copying it into state', async () => {
    window.app.state.activeConfig = savedConfig;
    window.app.initSettings();
    document.getElementById('db-config-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flushHandlers();
    expect(window.api.saveDbConfig).toHaveBeenCalledWith(expect.objectContaining({ password: '', useSavedPassword: true }));
    expect(window.app.state.isConnected).toBe(true);
    expect(window.app.state.activeConfig).not.toHaveProperty('password');
    expect(document.getElementById('connect-db-btn').disabled).toBe(false);
});

it('restores connection controls after an IPC failure', async () => {
    window.api.testConnection.mockRejectedValue(new Error('IPC unavailable'));
    window.api.saveDbConfig.mockRejectedValue(new Error('IPC unavailable'));
    window.app.initSettings();
    document.getElementById('test-connection-btn').click();
    await flushHandlers();
    expect(document.getElementById('test-connection-btn').disabled).toBe(false);
    document.getElementById('db-config-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flushHandlers();
    expect(window.app.state.isConnected).toBe(false);
    expect(document.getElementById('connect-db-btn').disabled).toBe(false);
    expect(document.getElementById('connection-feedback').textContent).toContain('Não foi possível');
});

it('does not report a successful connection when saved metadata cannot be recovered', async () => {
    window.api.getDbConfig.mockResolvedValue(null);
    window.app.initSettings();
    document.getElementById('db-config-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flushHandlers();
    expect(window.app.state.isConnected).toBe(false);
    expect(document.getElementById('connection-feedback').textContent).toContain('Não foi possível');
    expect(document.getElementById('connect-db-btn').disabled).toBe(false);
});

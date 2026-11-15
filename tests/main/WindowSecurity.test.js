const path = require('path');
const { pathToFileURL } = require('url');

jest.mock('electron', () => ({
    app: { whenReady: jest.fn().mockResolvedValue(), on: jest.fn() },
    BrowserWindow: jest.fn(), shell: { openExternal: jest.fn().mockResolvedValue() }
}));
jest.mock('../../src/main/ipc/handlers', () => ({ setupHandlers: jest.fn() }));

const { BrowserWindow, shell } = require('electron');
const { externalHttpUrl, isApplicationUrl } = require('../../src/main/infrastructure/security/NavigationPolicy');
const events = new Map();
let options;
let openWindow;

beforeAll(async () => {
    BrowserWindow.mockImplementation(config => {
        options = config;
        return {
            webContents: {
                on: jest.fn((name, callback) => events.set(name, callback)),
                setWindowOpenHandler: jest.fn(callback => { openWindow = callback; })
            },
            loadFile: jest.fn()
        };
    });
    require('../../src/main/main');
    await Promise.resolve();
});

beforeEach(() => jest.clearAllMocks());

it('keeps the renderer sandboxed and isolated from Node.js', () => {
    expect(options.webPreferences).toEqual(expect.objectContaining({
        sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true
    }));
});

it.each(['https://example.com', 'file:///tmp/index.html', 'javascript:alert(1)'])('blocks application navigation to %s', url => {
    const event = { preventDefault: jest.fn() };
    events.get('will-navigate')(event, url);
    expect(event.preventDefault).toHaveBeenCalled();
});

it('allows the application to reload its own document', () => {
    const url = pathToFileURL(path.resolve(__dirname, '../../src/renderer/index.html')).href;
    const event = { preventDefault: jest.fn() };
    events.get('will-navigate')(event, url);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(isApplicationUrl(url)).toBe(true);
});

it.each(['will-redirect', 'will-attach-webview'])('blocks %s', name => {
    const event = { preventDefault: jest.fn() };
    events.get(name)(event);
    expect(event.preventDefault).toHaveBeenCalled();
});

it.each(['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'mailto:someone@example.com',
    'https://user:pass@example.com', 'https://example.com/\n', null, 'not a URL'])('denies unsafe external URL %p', url => {
    expect(externalHttpUrl(url)).toBeNull();
    expect(openWindow({ url })).toEqual({ action: 'deny' });
    expect(shell.openExternal).not.toHaveBeenCalled();
});

it.each(['https://example.com/docs?a=1&b=2', 'http://example.com/'])('opens safe references in the external browser: %s', url => {
    expect(openWindow({ url })).toEqual({ action: 'deny' });
    expect(shell.openExternal).toHaveBeenCalledWith(url);
});

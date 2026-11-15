const path = require('path');
const { pathToFileURL } = require('url');

jest.mock('electron', () => ({ ipcMain: { handle: jest.fn() }, BrowserWindow: { fromWebContents: jest.fn() } }));
jest.mock('fs/promises', () => ({ readFile: jest.fn() }));
jest.mock('../../../src/main/application/AnalyzeSQLUseCase', () => ({ execute: jest.fn() }));
jest.mock('../../../src/main/application/AnalyzeExecutionPlanUseCase', () => ({ execute: jest.fn() }));
jest.mock('../../../src/main/application/TestConnectionUseCase', () => ({ execute: jest.fn() }));
jest.mock('../../../src/main/infrastructure/security/CredentialManager', () => ({ load: jest.fn(), save: jest.fn() }));

const { ipcMain, BrowserWindow } = require('electron');
const fs = require('fs/promises');
const SimpleAnalysis = require('../../../src/main/application/AnalyzeSQLUseCase');
const PlanAnalysis = require('../../../src/main/application/AnalyzeExecutionPlanUseCase');
const TestConnection = require('../../../src/main/application/TestConnectionUseCase');
const Credentials = require('../../../src/main/infrastructure/security/CredentialManager');
const { setupHandlers } = require('../../../src/main/ipc/handlers');

const config = { sgbd: 'mysql', host: 'localhost', port: 3306, user: 'reader', database: 'tuning_db', password: 'secret' };
const applicationUrl = pathToFileURL(path.resolve(__dirname, '../../../src/renderer/index.html')).href;
let handlers;
let event;

beforeEach(() => {
    jest.resetAllMocks();
    handlers = new Map();
    ipcMain.handle.mockImplementation((channel, handler) => handlers.set(channel, handler));
    BrowserWindow.fromWebContents.mockReturnValue({});
    const frame = { url: applicationUrl };
    event = { sender: { mainFrame: frame }, senderFrame: frame };
    TestConnection.execute.mockResolvedValue({ status: 'success' });
    setupHandlers();
});

describe('IPC sender verification', () => {
    it.each(['foreign-window', 'subframe', 'remote-page', 'other-file', 'query-string', 'missing-frame'])('rejects every handler for %s', origin => {
        if (origin === 'foreign-window') BrowserWindow.fromWebContents.mockReturnValue(null);
        if (origin === 'subframe') event.senderFrame = { url: applicationUrl };
        if (origin === 'remote-page') event.senderFrame.url = 'https://example.com';
        if (origin === 'other-file') event.senderFrame.url = 'file:///tmp/index.html';
        if (origin === 'query-string') event.senderFrame.url += '?redirect=1';
        if (origin === 'missing-frame') event.senderFrame = null;
        for (const handler of handlers.values()) {
            expect(() => handler(event, config)).toThrow('Origem IPC não autorizada');
        }
        expect(Credentials.load).not.toHaveBeenCalled();
        expect(Credentials.save).not.toHaveBeenCalled();
        expect(TestConnection.execute).not.toHaveBeenCalled();
        expect(SimpleAnalysis.execute).not.toHaveBeenCalled();
        expect(PlanAnalysis.execute).not.toHaveBeenCalled();
        expect(fs.readFile).not.toHaveBeenCalled();
    });
});

describe('template boundaries', () => {
    it.each(['../index', '../../main/main', '/etc/passwd', 'constructor', '__proto__', 'settings.html', {}, null])('rejects unlisted page %p', page => {
        expect(() => handlers.get('load-template')(event, page)).toThrow('Página não encontrada');
        expect(fs.readFile).not.toHaveBeenCalled();
    });

    it.each(['heuristic-analyzer', 'execution-plan', 'settings', 'history'])('loads the application template %s', async page => {
        fs.readFile.mockResolvedValue('<section>Template</section>');
        expect(await handlers.get('load-template')(event, page)).toBe('<section>Template</section>');
        expect(fs.readFile).toHaveBeenCalledWith(path.resolve(__dirname, `../../../src/renderer/pages/${page}.html`), 'utf8');
    });
});

describe('IPC input validation', () => {
    it.each([null, {}, [], 123, '', '   ', 'SELECT\0 1', 'x'.repeat(100001)])('rejects invalid SQL (%#)', sql => {
        expect(() => handlers.get('analyze-sql-simple')(event, sql)).toThrow('consulta SQL válida');
        expect(() => handlers.get('analyze-execution-plan')(event, sql, 'mysql')).toThrow('consulta SQL válida');
        expect(SimpleAnalysis.execute).not.toHaveBeenCalled();
        expect(PlanAnalysis.execute).not.toHaveBeenCalled();
    });

    it('passes SQL unchanged to the appropriate use case', async () => {
        const sql = "SELECT '<img src=x onerror=alert(1)>'";
        await handlers.get('analyze-sql-simple')(event, sql);
        await handlers.get('analyze-execution-plan')(event, sql, 'mysql');
        expect(SimpleAnalysis.execute).toHaveBeenCalledWith(sql);
        expect(PlanAnalysis.execute).toHaveBeenCalledWith(sql, 'mysql');
    });

    it('rejects an unsupported database engine', () => {
        expect(() => handlers.get('analyze-execution-plan')(event, 'SELECT 1', 'other')).toThrow('SGBD não suportado');
        expect(PlanAnalysis.execute).not.toHaveBeenCalled();
    });
});

describe('credential isolation', () => {
    it('returns saved connection metadata without its password', async () => {
        Credentials.load.mockResolvedValue(config);
        const result = await handlers.get('get-db-config')(event);
        expect(result).toEqual({ sgbd: 'mysql', host: 'localhost', port: 3306, user: 'reader', database: 'tuning_db', hasSavedPassword: true });
        expect(JSON.stringify(result)).not.toContain(config.password);
    });

    it('returns null when no connection has been saved', async () => {
        Credentials.load.mockResolvedValue(null);
        expect(await handlers.get('get-db-config')(event)).toBeNull();
    });

    it('reuses a saved password exclusively in the main process', async () => {
        Credentials.load.mockResolvedValue(config);
        await handlers.get('test-connection')(event, { ...config, password: '', useSavedPassword: true });
        expect(TestConnection.execute).toHaveBeenCalledWith(config);
    });

    it.each(['host', 'port', 'user', 'database', 'sgbd'])('refuses to reuse the password for a different %s', key => {
        Credentials.load.mockResolvedValue(config);
        return handlers.get('test-connection')(event, { ...config, [key]: 'other', useSavedPassword: true }).then(result => {
            expect(result.status).toBe('error');
            expect(TestConnection.execute).not.toHaveBeenCalled();
        });
    });

    it('refuses to reuse a password when no configuration exists', async () => {
        Credentials.load.mockResolvedValue(null);
        const result = await handlers.get('test-connection')(event, { ...config, useSavedPassword: true });
        expect(result.status).toBe('error');
        expect(TestConnection.execute).not.toHaveBeenCalled();
    });

    it('validates connectivity before saving a normalized configuration', async () => {
        await handlers.get('save-db-config')(event, { ...config, arbitraryOption: 'discard' });
        expect(TestConnection.execute).toHaveBeenCalledWith(config);
        expect(Credentials.save).toHaveBeenCalledWith(config);
        expect(TestConnection.execute.mock.invocationCallOrder[0]).toBeLessThan(Credentials.save.mock.invocationCallOrder[0]);
    });

    it('does not save credentials when connection validation fails', async () => {
        TestConnection.execute.mockResolvedValue({ status: 'error', message: 'Acesso negado' });
        await expect(handlers.get('save-db-config')(event, config)).rejects.toThrow('Acesso negado');
        expect(Credentials.save).not.toHaveBeenCalled();
    });

    it('does not save or test remote configurations', async () => {
        await expect(handlers.get('save-db-config')(event, { ...config, host: 'example.com' })).rejects.toThrow('Apenas conexões');
        expect(TestConnection.execute).not.toHaveBeenCalled();
        expect(Credentials.save).not.toHaveBeenCalled();
    });
});

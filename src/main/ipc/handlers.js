const { ipcMain, BrowserWindow } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const AnalyzeSQLUseCase = require('../application/AnalyzeSQLUseCase');
const TestConnectionUseCase = require('../application/TestConnectionUseCase');
const AnalyzeExecutionPlanUseCase = require('../application/AnalyzeExecutionPlanUseCase');
const CredentialManager = require('../infrastructure/security/CredentialManager');
const { validateConnectionConfig, publicConnectionConfig } = require('../infrastructure/security/ConnectionConfig');
const { isApplicationUrl } = require('../infrastructure/security/NavigationPolicy');

const pages = new Map(['heuristic-analyzer', 'execution-plan', 'settings', 'history'].map(id => [
    id, path.join(__dirname, '../../renderer/pages', `${id}.html`)
]));

function validateSender(event) {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner || event.senderFrame !== event.sender.mainFrame || !isApplicationUrl(event.senderFrame?.url)) {
        throw new Error('Origem IPC não autorizada.');
    }
}

function validateSql(sql) {
    if (typeof sql !== 'string' || !sql.trim() || sql.length > 100000 || sql.includes('\0')) {
        throw new Error('Informe uma consulta SQL válida de até 100000 caracteres.');
    }
    return sql;
}

async function resolveConfig(config) {
    if (config?.useSavedPassword === true) {
        const saved = await CredentialManager.load();
        if (!saved || !['sgbd', 'host', 'port', 'user', 'database'].every(key => config[key] === saved[key])) {
            throw new Error('Informe a senha para esta configuração de conexão.');
        }
        return validateConnectionConfig({ ...config, password: saved.password });
    }
    return validateConnectionConfig(config);
}

function register(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
        validateSender(event);
        return handler(...args);
    });
}

function setupHandlers() {
    register('analyze-sql-simple', sql => AnalyzeSQLUseCase.execute(validateSql(sql)));

    register('test-connection', async config => {
        try {
            return await TestConnectionUseCase.execute(await resolveConfig(config));
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    });

    register('analyze-execution-plan', (sql, sgbd) => {
        if (sgbd !== 'mysql') throw new Error('SGBD não suportado.');
        return AnalyzeExecutionPlanUseCase.execute(validateSql(sql), sgbd);
    });

    register('load-template', pageId => {
        const filePath = pages.get(pageId);
        if (!filePath) throw new Error('Página não encontrada.');
        return fs.readFile(filePath, 'utf8');
    });

    register('save-db-config', async config => {
        const validated = await resolveConfig(config);
        const result = await TestConnectionUseCase.execute(validated);
        if (result.status !== 'success') throw new Error(result.message);
        return CredentialManager.save(validated);
    });

    register('get-db-config', async () => publicConnectionConfig(await CredentialManager.load()));
}

module.exports = { setupHandlers };

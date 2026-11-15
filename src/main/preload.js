const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    analyzeSqlSimple: (sql) => ipcRenderer.invoke('analyze-sql-simple', sql),
    testConnection: (config) => ipcRenderer.invoke('test-connection', config),
    analyzeExecutionPlan: (sql, sgbd) => ipcRenderer.invoke('analyze-execution-plan', sql, sgbd),
    loadTemplate: (pageId) => ipcRenderer.invoke('load-template', pageId),
    saveDbConfig: (config) => ipcRenderer.invoke('save-db-config', config),
    getDbConfig: () => ipcRenderer.invoke('get-db-config'),
});

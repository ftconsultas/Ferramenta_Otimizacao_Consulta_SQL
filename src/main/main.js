const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { isApplicationUrl, externalHttpUrl } = require('./infrastructure/security/NavigationPolicy');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isApplicationUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on('will-redirect', event => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = externalHttpUrl(url);
    if (externalUrl) {
      shell.openExternal(externalUrl).catch(() => console.error('Não foi possível abrir a referência.'));
    }
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

const { setupHandlers } = require('./ipc/handlers');

app.whenReady().then(() => {
  setupHandlers(); // Inicializa os handlers IPC
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

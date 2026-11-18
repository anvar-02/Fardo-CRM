const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path'), fs = require('fs');
const file = () => path.join(app.getPath('userData'), 'fardo-demo.json');
ipcMain.handle('load', () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return null; } });
ipcMain.handle('save', (e, d) => { fs.writeFileSync(file(), JSON.stringify(d)); return true; });
ipcMain.handle('reset', () => { try { fs.unlinkSync(file()); } catch {} return true; });
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const w = new BrowserWindow({ width: 1280, height: 820, minWidth: 1000, minHeight: 640,
    title: 'Fardo Consulting CRM — прототип',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  w.loadFile('index.html');
});
app.on('window-all-closed', () => app.quit());

// Windows desktop wrapper (NOT tested here - needs: npm i -D electron electron-builder; Electron 35+ for node:sqlite).
import { app, BrowserWindow } from 'electron'; import path from 'node:path';
import { openDb, ensureAdmin } from '../src/core.js'; import { makeServer } from '../src/server.js';
app.whenReady().then(() => { const db = openDb(path.join(app.getPath('userData'), 'pos.db')); ensureAdmin(db);
  makeServer(db).listen(3000, '127.0.0.1', () => new BrowserWindow({ width: 1366, height: 800, autoHideMenuBar: true }).loadURL('http://127.0.0.1:3000')); });

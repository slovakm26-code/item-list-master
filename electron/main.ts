/**
 * Electron Main Process - SQLite Storage (sql.js WASM)
 * 
 * Architecture:
 * - Single .db file with WAL mode
 * - FTS5 full-text search
 * - IPC bridge for renderer SQL operations
 * - Image storage as separate files on disk
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsp } from 'fs';

// Paths
const USER_DATA = app.getPath('userData');
const DB_PATH = path.join(USER_DATA, 'stuff-organizer.db');
const IMAGES_DIR = path.join(USER_DATA, 'images');
const THUMBS_DIR = path.join(USER_DATA, 'thumbnails');
const BACKUP_DIR = path.join(USER_DATA, 'backups');

// Create directories
[IMAGES_DIR, THUMBS_DIR, BACKUP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// sql.js database instance
let db: any = null;

/**
 * Initialize sql.js and open/create database
 */
async function initDatabase(): Promise<void> {
  const initSqlJs = (await import('sql.js')).default;
  
  // Initialize sql.js with WASM
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = await fsp.readFile(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('Database loaded from:', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('New database created');
  }

  // Set pragmas
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  db.run('PRAGMA cache_size = -64000');
  db.run('PRAGMA temp_store = MEMORY');
  db.run('PRAGMA foreign_keys = ON');
}

/**
 * Save database to disk (atomic write)
 */
async function saveDatabase(): Promise<void> {
  if (!db) return;
  
  const data = db.export();
  const buffer = Buffer.from(data);
  const tempPath = DB_PATH + '.tmp';
  
  try {
    await fsp.writeFile(tempPath, buffer);
    await fsp.rename(tempPath, DB_PATH);
  } catch (error) {
    console.error('Failed to save database:', error);
    try { await fsp.unlink(tempPath); } catch {}
    throw error;
  }
}

// Auto-save interval (every 30 seconds if dirty)
let isDirty = false;
let saveInterval: NodeJS.Timeout;

function markDirty() {
  isDirty = true;
}

function startAutoSave() {
  saveInterval = setInterval(async () => {
    if (isDirty && db) {
      try {
        await saveDatabase();
        isDirty = false;
      } catch (e) {
        console.error('Auto-save failed:', e);
      }
    }
  }, 30_000);
}

// ============================================
// IPC Handlers - Database
// ============================================
function setupDatabaseIPC() {
  // Execute SQL (for schema init, multiple statements)
  ipcMain.handle('db:exec', async (_event, sql: string) => {
    db.exec(sql);
    markDirty();
    await saveDatabase();
  });

  // Run single statement (INSERT, UPDATE, DELETE)
  ipcMain.handle('db:run', async (_event, sql: string, params?: any[]) => {
    db.run(sql, params || []);
    markDirty();
    const info = db.getRowsModified();
    return { changes: info, lastInsertRowid: 0 };
  });

  // Query single row
  ipcMain.handle('db:get', (_event, sql: string, params?: any[]) => {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  });

  // Query multiple rows
  ipcMain.handle('db:all', (_event, sql: string, params?: any[]) => {
    const results: any[] = [];
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  });

  // Batch insert (in transaction for performance)
  ipcMain.handle('db:batchInsert', async (_event, sql: string, paramSets: any[][]) => {
    db.run('BEGIN TRANSACTION');
    try {
      const stmt = db.prepare(sql);
      for (const params of paramSets) {
        stmt.run(params);
      }
      stmt.free();
      db.run('COMMIT');
      markDirty();
      await saveDatabase();
      return paramSets.length;
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  });

  // Export database as binary
  ipcMain.handle('db:exportDB', () => {
    const data = db.export();
    return new Uint8Array(data);
  });

  // Import database from binary
  ipcMain.handle('db:importDB', async (_event, data: Uint8Array) => {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    
    if (db) db.close();
    db = new SQL.Database(data);
    await saveDatabase();
  });

  // Backup
  ipcMain.handle('db:backup', async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.db`);
    
    const data = db.export();
    await fsp.writeFile(backupPath, Buffer.from(data));
    
    console.log('Backup created:', backupPath);
    return backupPath;
  });

  // Database info
  ipcMain.handle('db:getInfo', async () => {
    let size = 0;
    let walSize = 0;
    
    try {
      if (fs.existsSync(DB_PATH)) {
        size = (await fsp.stat(DB_PATH)).size;
      }
      const walPath = DB_PATH + '-wal';
      if (fs.existsSync(walPath)) {
        walSize = (await fsp.stat(walPath)).size;
      }
    } catch {}

    return { path: DB_PATH, size, walSize };
  });

  // Open data folder
  ipcMain.handle('app:openDataFolder', () => {
    shell.openPath(USER_DATA);
  });

  // Get user data path
  ipcMain.handle('app:getUserDataPath', () => {
    return USER_DATA;
  });
}

// ============================================
// IPC Handlers - Images
// ============================================
function setupImageIPC() {
  let sharp: any;

  const getSharp = async () => {
    if (!sharp) {
      sharp = (await import('sharp')).default;
    }
    return sharp;
  };

  ipcMain.handle('images:save', async (_event, id: string, data: Buffer | string) => {
    const imagePath = path.join(IMAGES_DIR, `${id}.jpg`);
    const thumbPath = path.join(THUMBS_DIR, `${id}.jpg`);

    const buffer = typeof data === 'string'
      ? Buffer.from(data.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      : data;

    await fsp.writeFile(imagePath, buffer);

    try {
      const sharpInstance = await getSharp();
      await sharpInstance(buffer)
        .resize(200, 280, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);
    } catch (e) {
      console.warn('Thumbnail creation failed:', e);
      await fsp.writeFile(thumbPath, buffer);
    }

    return { imagePath, thumbPath };
  });

  ipcMain.handle('images:load', (_event, id: string, thumbnail = false) => {
    const dir = thumbnail ? THUMBS_DIR : IMAGES_DIR;
    const imagePath = path.join(dir, `${id}.jpg`);
    if (fs.existsSync(imagePath)) return `file://${imagePath}`;
    return null;
  });

  ipcMain.handle('images:delete', async (_event, id: string) => {
    const imagePath = path.join(IMAGES_DIR, `${id}.jpg`);
    const thumbPath = path.join(THUMBS_DIR, `${id}.jpg`);
    try { if (fs.existsSync(imagePath)) await fsp.unlink(imagePath); } catch {}
    try { if (fs.existsSync(thumbPath)) await fsp.unlink(thumbPath); } catch {}
  });

  ipcMain.handle('images:batchSave', async (_event, images: Array<{ id: string; data: string }>) => {
    const sharpInstance = await getSharp();
    const results: string[] = [];

    for (const { id, data } of images) {
      const buffer = Buffer.from(data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const imagePath = path.join(IMAGES_DIR, `${id}.jpg`);
      const thumbPath = path.join(THUMBS_DIR, `${id}.jpg`);

      await fsp.writeFile(imagePath, buffer);
      try {
        await sharpInstance(buffer)
          .resize(200, 280, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toFile(thumbPath);
      } catch {
        await fsp.writeFile(thumbPath, buffer);
      }
      results.push(id);
    }
    return results;
  });
}

// ============================================
// Window
// ============================================
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ============================================
// App Lifecycle
// ============================================
app.whenReady().then(async () => {
  await initDatabase();
  setupDatabaseIPC();
  setupImageIPC();
  startAutoSave();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  // Save before quit
  clearInterval(saveInterval);
  if (isDirty && db) {
    await saveDatabase();
  }
  if (db) db.close();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  clearInterval(saveInterval);
  if (isDirty && db) {
    await saveDatabase();
  }
  if (db) db.close();
});

/**
 * Electron Main Process - SQLite Storage (better-sqlite3 native)
 * 
 * Architecture:
 * - Single .db file with WAL mode
 * - FTS5 full-text search
 * - IPC bridge for renderer SQL operations
 * - Image storage as separate files on disk
 * - Window bounds persistence
 * - Detail panel state persistence
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsp } from 'fs';
import Database from 'better-sqlite3';

// Paths
const USER_DATA = app.getPath('userData');
const DB_PATH = path.join(USER_DATA, 'stuff-organizer.db');
const IMAGES_DIR = path.join(USER_DATA, 'images');
const THUMBS_DIR = path.join(USER_DATA, 'thumbnails');
const BACKUP_DIR = path.join(USER_DATA, 'backups');
const WINDOW_STATE_PATH = path.join(USER_DATA, 'window-state.json');

// Create directories
[IMAGES_DIR, THUMBS_DIR, BACKUP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// better-sqlite3 database instance
let db: Database.Database | null = null;

// ============================================
// Window State Persistence
// ============================================
interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

function loadWindowState(): WindowState {
  try {
    if (fs.existsSync(WINDOW_STATE_PATH)) {
      const data = fs.readFileSync(WINDOW_STATE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch {}
  return { width: 1400, height: 900 };
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const isMaximized = win.isMaximized();
    const bounds = win.getNormalBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized,
    };
    fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save window state:', e);
  }
}

// ============================================
// Database Init (better-sqlite3 - synchronous)
// ============================================

function initDatabase(): void {
  db = new Database(DB_PATH);

  // Performance pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456');
  db.pragma('foreign_keys = ON');

  console.log('Database opened:', DB_PATH);
}

// ============================================
// IPC Handlers - Database
// ============================================
function setupDatabaseIPC() {
  // Execute SQL (for schema init, multiple statements)
  ipcMain.handle('db:exec', async (_event, sql: string) => {
    db!.exec(sql);
  });

  // Run single statement (INSERT, UPDATE, DELETE)
  ipcMain.handle('db:run', async (_event, sql: string, params?: any[]) => {
    const stmt = db!.prepare(sql);
    const result = stmt.run(...(params || []));
    return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
  });

  // Query single row
  ipcMain.handle('db:get', async (_event, sql: string, params?: any[]) => {
    const stmt = db!.prepare(sql);
    return stmt.get(...(params || [])) || null;
  });

  // Query multiple rows
  ipcMain.handle('db:all', async (_event, sql: string, params?: any[]) => {
    const stmt = db!.prepare(sql);
    return stmt.all(...(params || []));
  });

  // Batch insert (in transaction for performance)
  ipcMain.handle('db:batchInsert', async (_event, sql: string, paramSets: any[][]) => {
    const stmt = db!.prepare(sql);
    const insertMany = db!.transaction((rows: any[][]) => {
      for (const params of rows) {
        stmt.run(...params);
      }
    });
    insertMany(paramSets);
    return paramSets.length;
  });

  // Export database as binary copy
  ipcMain.handle('db:exportDB', async () => {
    const data = await fsp.readFile(DB_PATH);
    return new Uint8Array(data);
  });

  // Import database from binary
  ipcMain.handle('db:importDB', async (_event, data: Uint8Array) => {
    // Close current db
    if (db) db.close();

    // Write new db file
    await fsp.writeFile(DB_PATH, Buffer.from(data));

    // Reopen
    initDatabase();
  });

  // Backup
  ipcMain.handle('db:backup', async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.db`);
    await fsp.copyFile(DB_PATH, backupPath);
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
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const savedState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    x: savedState.x,
    y: savedState.y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (savedState.isMaximized) {
    mainWindow.maximize();
  }

  // Save window state on resize/move (debounced)
  let saveTimeout: NodeJS.Timeout | null = null;
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        saveWindowState(mainWindow);
      }
    }, 500);
  };

  mainWindow.on('resize', debouncedSave);
  mainWindow.on('move', debouncedSave);
  mainWindow.on('maximize', debouncedSave);
  mainWindow.on('unmaximize', debouncedSave);

  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      saveWindowState(mainWindow);
    }
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
app.whenReady().then(() => {
  initDatabase();
  setupDatabaseIPC();
  setupImageIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (db) {
    db.close();
    db = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (db) {
    db.close();
    db = null;
  }
});

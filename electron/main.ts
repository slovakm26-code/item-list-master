/**
 * Electron Main Process - JSON Storage Version
 * 
 * Používa JSON súbor namiesto SQLite pre jednoduché nasadenie
 * bez natívnych závislostí (better-sqlite3).
 * 
 * SETUP:
 * 1. npm install electron electron-builder sharp --save-dev
 * 2. npm run electron:dev
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Cesty
const USER_DATA = app.getPath('userData');
const DATA_PATH = path.join(USER_DATA, 'data.json');
const IMAGES_DIR = path.join(USER_DATA, 'images');
const THUMBS_DIR = path.join(USER_DATA, 'thumbnails');
const BACKUP_DIR = path.join(USER_DATA, 'backups');

// Vytvor priečinky
[IMAGES_DIR, THUMBS_DIR, BACKUP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Formát JSON dát
interface DataFile {
  version: number;
  lastModified: string;
  categories: any[];
  items: any[];
}

// Predvolená štruktúra
const DEFAULT_DATA: DataFile = {
  version: 3,
  lastModified: new Date().toISOString(),
  categories: [],
  items: [],
};

/**
 * Načítaj dáta z JSON súboru
 */
function loadData(): DataFile {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const content = fs.readFileSync(DATA_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load data.json:', error);
  }
  return { ...DEFAULT_DATA };
}

/**
 * Ulož dáta do JSON súboru (atomic write)
 */
function saveData(data: DataFile): void {
  const tempPath = DATA_PATH + '.tmp';
  try {
    data.lastModified = new Date().toISOString();
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, DATA_PATH); // Atomic replace
    console.log(`Data saved: ${data.items.length} items, ${data.categories.length} categories`);
  } catch (error) {
    console.error('Failed to save data.json:', error);
    // Cleanup temp file if exists
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}

// IPC Handlers pre JSON operácie
function setupJSONIPC() {
  // Načítaj celé dáta
  ipcMain.handle('json:load', () => {
    const data = loadData();
    console.log(`Loaded: ${data.items.length} items, ${data.categories.length} categories`);
    return data;
  });

  // Ulož celé dáta
  ipcMain.handle('json:save', (_event, data: DataFile) => {
    saveData(data);
  });

  // Export ako JSON string
  ipcMain.handle('json:export', () => {
    const data = loadData();
    return JSON.stringify(data, null, 2);
  });

  // Import z JSON string
  ipcMain.handle('json:import', (_event, jsonString: string) => {
    try {
      const data = JSON.parse(jsonString) as DataFile;
      saveData(data);
      return { success: true, items: data.items.length, categories: data.categories.length };
    } catch (error) {
      console.error('Import failed:', error);
      throw error;
    }
  });

  // Záloha
  ipcMain.handle('json:backup', () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
    const data = loadData();
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log('Backup created:', backupPath);
    return backupPath;
  });

  // Info o úložisku
  ipcMain.handle('json:getInfo', () => {
    const data = loadData();
    let size = 0;
    try {
      if (fs.existsSync(DATA_PATH)) {
        size = fs.statSync(DATA_PATH).size;
      }
    } catch {}
    
    return {
      path: DATA_PATH,
      size,
      itemCount: data.items.length,
      categoryCount: data.categories.length,
      lastModified: data.lastModified,
    };
  });
}

// IPC Handlers pre obrázky
function setupImageIPC() {
  // Dynamický import pre sharp (ESM)
  let sharp: any;
  
  const getSharp = async () => {
    if (!sharp) {
      sharp = (await import('sharp')).default;
    }
    return sharp;
  };

  // Ulož obrázok
  ipcMain.handle('images:save', async (_event, id: string, data: Buffer | string) => {
    const imagePath = path.join(IMAGES_DIR, `${id}.jpg`);
    const thumbPath = path.join(THUMBS_DIR, `${id}.jpg`);

    // Ak je base64, konvertuj na Buffer
    const buffer = typeof data === 'string' 
      ? Buffer.from(data.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      : data;

    // Ulož originál
    fs.writeFileSync(imagePath, buffer);

    // Vytvor thumbnail
    try {
      const sharpInstance = await getSharp();
      await sharpInstance(buffer)
        .resize(200, 280, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);
    } catch (e) {
      console.warn('Thumbnail creation failed:', e);
      fs.writeFileSync(thumbPath, buffer); // Fallback
    }

    return { imagePath, thumbPath };
  });

  // Načítaj obrázok
  ipcMain.handle('images:load', (_event, id: string, thumbnail = false) => {
    const dir = thumbnail ? THUMBS_DIR : IMAGES_DIR;
    const imagePath = path.join(dir, `${id}.jpg`);
    
    if (fs.existsSync(imagePath)) {
      return `file://${imagePath}`;
    }
    return null;
  });

  // Zmaž obrázok
  ipcMain.handle('images:delete', (_event, id: string) => {
    const imagePath = path.join(IMAGES_DIR, `${id}.jpg`);
    const thumbPath = path.join(THUMBS_DIR, `${id}.jpg`);
    
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  });

  // Batch import obrázkov
  ipcMain.handle('images:batchSave', async (_event, images: Array<{ id: string; data: string }>) => {
    const sharpInstance = await getSharp();
    const results: string[] = [];
    
    for (const { id, data } of images) {
      const buffer = Buffer.from(data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const imagePath = path.join(IMAGES_DIR, `${id}.jpg`);
      const thumbPath = path.join(THUMBS_DIR, `${id}.jpg`);
      
      fs.writeFileSync(imagePath, buffer);
      
      try {
        await sharpInstance(buffer)
          .resize(200, 280, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toFile(thumbPath);
      } catch {
        fs.writeFileSync(thumbPath, buffer);
      }
      
      results.push(id);
    }
    
    return results;
  });
}

// Vytvor okno
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

  // Dev alebo production
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// App lifecycle
app.whenReady().then(() => {
  setupJSONIPC();
  setupImageIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

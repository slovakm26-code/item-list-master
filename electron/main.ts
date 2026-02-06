/**
 * Electron Main Process - Chunked JSON Storage for 10M+ Items
 * 
 * Architecture:
 * - Chunks directory with 100k items per chunk
 * - Lazy loading: first 2 chunks loaded immediately, rest in background
 * - Async I/O with fs.promises to keep main thread free
 * - Partial chunk updates for single item edits
 * 
 * SETUP:
 * 1. cd electron && npm install
 * 2. npm run dev
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsp } from 'fs';

// Paths
const USER_DATA = app.getPath('userData');
const DATA_DIR = path.join(USER_DATA, 'data');
const CHUNKS_DIR = path.join(DATA_DIR, 'chunks');
const IMAGES_DIR = path.join(USER_DATA, 'images');
const THUMBS_DIR = path.join(USER_DATA, 'thumbnails');
const BACKUP_DIR = path.join(USER_DATA, 'backups');

// Legacy path for migration
const LEGACY_DATA_PATH = path.join(USER_DATA, 'data.json');

// Chunk configuration
const CHUNK_SIZE = 100_000; // 100k items per chunk

// Create directories
[DATA_DIR, CHUNKS_DIR, IMAGES_DIR, THUMBS_DIR, BACKUP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Data structures
interface ChunkMeta {
  version: number;
  lastModified: string;
  categories: any[];
  totalItems: number;
  chunkCount: number;
  chunkSize: number;
}

interface DataFile {
  version: number;
  lastModified: string;
  categories: any[];
  items: any[];
}

// Default metadata
const DEFAULT_META: ChunkMeta = {
  version: 4,
  lastModified: new Date().toISOString(),
  categories: [],
  totalItems: 0,
  chunkCount: 0,
  chunkSize: CHUNK_SIZE,
};

/**
 * Get chunk file path
 */
function getChunkPath(index: number): string {
  return path.join(CHUNKS_DIR, `items-${index.toString().padStart(4, '0')}.json`);
}

/**
 * Get metadata path
 */
function getMetaPath(): string {
  return path.join(DATA_DIR, 'meta.json');
}

/**
 * Load metadata
 */
async function loadMeta(): Promise<ChunkMeta> {
  try {
    const metaPath = getMetaPath();
    if (fs.existsSync(metaPath)) {
      const content = await fsp.readFile(metaPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load meta.json:', error);
  }
  return { ...DEFAULT_META };
}

/**
 * Save metadata (atomic write)
 */
async function saveMeta(meta: ChunkMeta): Promise<void> {
  const metaPath = getMetaPath();
  const tempPath = metaPath + '.tmp';
  try {
    meta.lastModified = new Date().toISOString();
    await fsp.writeFile(tempPath, JSON.stringify(meta, null, 2), 'utf-8');
    await fsp.rename(tempPath, metaPath);
  } catch (error) {
    console.error('Failed to save meta.json:', error);
    try { await fsp.unlink(tempPath); } catch {}
    throw error;
  }
}

/**
 * Load a single chunk
 */
async function loadChunk(index: number): Promise<any[]> {
  const chunkPath = getChunkPath(index);
  try {
    if (fs.existsSync(chunkPath)) {
      const content = await fsp.readFile(chunkPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Failed to load chunk ${index}:`, error);
  }
  return [];
}

/**
 * Save a single chunk (atomic write)
 */
async function saveChunk(index: number, items: any[]): Promise<void> {
  const chunkPath = getChunkPath(index);
  const tempPath = chunkPath + '.tmp';
  try {
    await fsp.writeFile(tempPath, JSON.stringify(items), 'utf-8');
    await fsp.rename(tempPath, chunkPath);
  } catch (error) {
    console.error(`Failed to save chunk ${index}:`, error);
    try { await fsp.unlink(tempPath); } catch {}
    throw error;
  }
}

/**
 * Migrate from legacy single JSON file to chunked format
 */
async function migrateFromLegacy(): Promise<boolean> {
  if (!fs.existsSync(LEGACY_DATA_PATH)) return false;
  
  console.log('Migrating from legacy data.json to chunked format...');
  
  try {
    const content = await fsp.readFile(LEGACY_DATA_PATH, 'utf-8');
    const data: DataFile = JSON.parse(content);
    
    // Create chunks
    const items = data.items || [];
    const chunkCount = Math.ceil(items.length / CHUNK_SIZE);
    
    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, items.length);
      const chunkItems = items.slice(start, end);
      await saveChunk(i, chunkItems);
      console.log(`Migrated chunk ${i + 1}/${chunkCount} (${chunkItems.length} items)`);
    }
    
    // Save metadata
    const meta: ChunkMeta = {
      version: 4,
      lastModified: new Date().toISOString(),
      categories: data.categories || [],
      totalItems: items.length,
      chunkCount,
      chunkSize: CHUNK_SIZE,
    };
    await saveMeta(meta);
    
    // Backup and remove legacy file
    const backupPath = LEGACY_DATA_PATH + '.backup';
    await fsp.rename(LEGACY_DATA_PATH, backupPath);
    
    console.log(`Migration complete: ${items.length} items in ${chunkCount} chunks`);
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    return false;
  }
}

/**
 * Load all chunks (returns items array)
 */
async function loadAllChunks(): Promise<any[]> {
  const meta = await loadMeta();
  const allItems: any[] = [];
  
  for (let i = 0; i < meta.chunkCount; i++) {
    const chunkItems = await loadChunk(i);
    allItems.push(...chunkItems);
  }
  
  return allItems;
}

/**
 * Save all items to chunks
 */
async function saveAllChunks(items: any[], meta: ChunkMeta): Promise<void> {
  const chunkCount = Math.ceil(items.length / CHUNK_SIZE);
  
  // Save each chunk
  for (let i = 0; i < chunkCount; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, items.length);
    await saveChunk(i, items.slice(start, end));
  }
  
  // Remove old chunks that are no longer needed
  const oldChunkCount = meta.chunkCount;
  for (let i = chunkCount; i < oldChunkCount; i++) {
    const chunkPath = getChunkPath(i);
    try {
      if (fs.existsSync(chunkPath)) {
        await fsp.unlink(chunkPath);
      }
    } catch {}
  }
  
  // Update metadata
  meta.totalItems = items.length;
  meta.chunkCount = chunkCount;
  await saveMeta(meta);
  
  console.log(`Saved ${items.length} items in ${chunkCount} chunks`);
}

// IPC Handlers for chunked JSON
function setupChunkedJSONIPC() {
  // Load initial data (first 2 chunks for instant UI)
  ipcMain.handle('json:loadInitial', async () => {
    await migrateFromLegacy();
    const meta = await loadMeta();
    
    // Load first 2 chunks immediately
    const initialItems: any[] = [];
    const chunksToLoad = Math.min(2, meta.chunkCount);
    
    for (let i = 0; i < chunksToLoad; i++) {
      const chunkItems = await loadChunk(i);
      initialItems.push(...chunkItems);
    }
    
    console.log(`Initial load: ${initialItems.length}/${meta.totalItems} items (${chunksToLoad} chunks)`);
    
    return {
      categories: meta.categories,
      items: initialItems,
      totalItems: meta.totalItems,
      chunkCount: meta.chunkCount,
      loadedChunks: chunksToLoad,
    };
  });
  
  // Load remaining chunks (background)
  ipcMain.handle('json:loadRemainingChunks', async (_event, startChunk: number) => {
    const meta = await loadMeta();
    const items: any[] = [];
    
    for (let i = startChunk; i < meta.chunkCount; i++) {
      const chunkItems = await loadChunk(i);
      items.push(...chunkItems);
    }
    
    console.log(`Background load: ${items.length} items (chunks ${startChunk}-${meta.chunkCount - 1})`);
    return items;
  });
  
  // Load all data at once (for smaller datasets or full sync)
  ipcMain.handle('json:load', async () => {
    await migrateFromLegacy();
    const meta = await loadMeta();
    const items = await loadAllChunks();
    
    console.log(`Full load: ${items.length} items, ${meta.categories.length} categories`);
    
    return {
      version: meta.version,
      lastModified: meta.lastModified,
      categories: meta.categories,
      items,
    };
  });
  
  // Save all data
  ipcMain.handle('json:save', async (_event, data: { categories: any[]; items: any[] }) => {
    const meta = await loadMeta();
    meta.categories = data.categories;
    await saveAllChunks(data.items, meta);
  });
  
  // Update single chunk (smart partial update)
  ipcMain.handle('json:updateChunk', async (_event, chunkIndex: number, items: any[]) => {
    await saveChunk(chunkIndex, items);
    const meta = await loadMeta();
    // Recalculate total
    let total = 0;
    for (let i = 0; i < meta.chunkCount; i++) {
      if (i === chunkIndex) {
        total += items.length;
      } else {
        const chunk = await loadChunk(i);
        total += chunk.length;
      }
    }
    meta.totalItems = total;
    await saveMeta(meta);
  });
  
  // Update categories only (no need to touch item chunks)
  ipcMain.handle('json:updateCategories', async (_event, categories: any[]) => {
    const meta = await loadMeta();
    meta.categories = categories;
    await saveMeta(meta);
  });
  
  // Export as JSON string
  ipcMain.handle('json:export', async () => {
    const meta = await loadMeta();
    const items = await loadAllChunks();
    return JSON.stringify({
      version: meta.version,
      lastModified: meta.lastModified,
      categories: meta.categories,
      items,
    }, null, 2);
  });
  
  // Import from JSON string
  ipcMain.handle('json:import', async (_event, jsonString: string) => {
    try {
      const data: DataFile = JSON.parse(jsonString);
      const meta: ChunkMeta = {
        version: 4,
        lastModified: new Date().toISOString(),
        categories: data.categories || [],
        totalItems: 0,
        chunkCount: 0,
        chunkSize: CHUNK_SIZE,
      };
      await saveAllChunks(data.items || [], meta);
      return { success: true, items: data.items?.length || 0, categories: data.categories?.length || 0 };
    } catch (error) {
      console.error('Import failed:', error);
      throw error;
    }
  });
  
  // Backup
  ipcMain.handle('json:backup', async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
    
    const meta = await loadMeta();
    const items = await loadAllChunks();
    
    await fsp.writeFile(backupPath, JSON.stringify({
      version: meta.version,
      lastModified: meta.lastModified,
      categories: meta.categories,
      items,
    }, null, 2), 'utf-8');
    
    console.log('Backup created:', backupPath);
    return backupPath;
  });
  
  // Storage info
  ipcMain.handle('json:getInfo', async () => {
    const meta = await loadMeta();
    
    // Calculate total size of all chunks
    let totalSize = 0;
    try {
      const metaPath = getMetaPath();
      if (fs.existsSync(metaPath)) {
        totalSize += (await fsp.stat(metaPath)).size;
      }
      for (let i = 0; i < meta.chunkCount; i++) {
        const chunkPath = getChunkPath(i);
        if (fs.existsSync(chunkPath)) {
          totalSize += (await fsp.stat(chunkPath)).size;
        }
      }
    } catch {}
    
    return {
      path: DATA_DIR,
      size: totalSize,
      itemCount: meta.totalItems,
      categoryCount: meta.categories.length,
      chunkCount: meta.chunkCount,
      chunkSize: meta.chunkSize,
      lastModified: meta.lastModified,
    };
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

// IPC Handlers for images
function setupImageIPC() {
  let sharp: any;
  
  const getSharp = async () => {
    if (!sharp) {
      sharp = (await import('sharp')).default;
    }
    return sharp;
  };
  
  // Save image
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
  
  // Load image
  ipcMain.handle('images:load', (_event, id: string, thumbnail = false) => {
    const dir = thumbnail ? THUMBS_DIR : IMAGES_DIR;
    const imagePath = path.join(dir, `${id}.jpg`);
    
    if (fs.existsSync(imagePath)) {
      return `file://${imagePath}`;
    }
    return null;
  });
  
  // Delete image
  ipcMain.handle('images:delete', async (_event, id: string) => {
    const imagePath = path.join(IMAGES_DIR, `${id}.jpg`);
    const thumbPath = path.join(THUMBS_DIR, `${id}.jpg`);
    
    try { if (fs.existsSync(imagePath)) await fsp.unlink(imagePath); } catch {}
    try { if (fs.existsSync(thumbPath)) await fsp.unlink(thumbPath); } catch {}
  });
  
  // Batch save images
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

// Create window
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

// App lifecycle
app.whenReady().then(() => {
  setupChunkedJSONIPC();
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

/**
 * Electron Main Process
 * 
 * SETUP:
 * 1. npm install electron electron-builder better-sqlite3 sharp --save-dev
 * 2. Skopíruj tento súbor do electron/main.ts
 * 3. Skopíruj preload.ts do electron/preload.ts
 * 4. Pridaj do package.json: "main": "electron/main.js"
 * 5. npm run electron:dev
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';

// Cesty
const USER_DATA = app.getPath('userData');
const DB_PATH = path.join(USER_DATA, 'collection.db');
const IMAGES_DIR = path.join(USER_DATA, 'images');
const THUMBS_DIR = path.join(USER_DATA, 'thumbnails');
const BACKUP_DIR = path.join(USER_DATA, 'backups');

// Vytvor priečinky
[IMAGES_DIR, THUMBS_DIR, BACKUP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// SQLite databáza
let db: Database.Database;

function initDatabase() {
  db = new Database(DB_PATH);
  
  // Optimalizácie pre výkon
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64MB cache
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O

  // Schéma
  db.exec(`
    -- Categories table with custom fields support
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentId TEXT,
      orderIndex INTEGER DEFAULT 0,
      icon TEXT,
      emoji TEXT,
      customFields TEXT,
      enabledFields TEXT
    );

    -- Items table with all fields including custom fields
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      year INTEGER,
      rating REAL,
      genres TEXT,
      description TEXT,
      categoryId TEXT NOT NULL,
      path TEXT,
      addedDate TEXT,
      coverPath TEXT,
      orderIndex INTEGER DEFAULT 0,
      season INTEGER,
      episode INTEGER,
      watched INTEGER DEFAULT 0,
      customFieldValues TEXT,
      FOREIGN KEY (categoryId) REFERENCES categories(id)
    );

    -- Indexy
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(categoryId);
    CREATE INDEX IF NOT EXISTS idx_items_name ON items(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_items_year ON items(year);
    CREATE INDEX IF NOT EXISTS idx_items_rating ON items(rating);
    CREATE INDEX IF NOT EXISTS idx_items_added ON items(addedDate);
    CREATE INDEX IF NOT EXISTS idx_items_order ON items(orderIndex);
    CREATE INDEX IF NOT EXISTS idx_items_cat_name ON items(categoryId, name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_items_cat_year ON items(categoryId, year DESC);
    CREATE INDEX IF NOT EXISTS idx_items_cat_rating ON items(categoryId, rating DESC);

    -- FTS5 Full-Text Search
    CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
      name, description, genres,
      content=items, content_rowid=rowid
    );

    -- Triggery pre FTS sync
    CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
      INSERT INTO items_fts(rowid, name, description, genres) 
      VALUES (NEW.rowid, NEW.name, NEW.description, NEW.genres);
    END;

    CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, name, description, genres) 
      VALUES('delete', OLD.rowid, OLD.name, OLD.description, OLD.genres);
    END;

    CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, name, description, genres) 
      VALUES('delete', OLD.rowid, OLD.name, OLD.description, OLD.genres);
      INSERT INTO items_fts(rowid, name, description, genres) 
      VALUES (NEW.rowid, NEW.name, NEW.description, NEW.genres);
    END;

    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('schema_version', '3');
  `);

  console.log('Database initialized at:', DB_PATH);
}

// Prepared statements (kompilované raz, použité mnohokrát)
let stmts: {
  insertItem: Database.Statement;
  updateItem: Database.Statement;
  deleteItem: Database.Statement;
  getItems: Database.Statement;
  searchFTS: Database.Statement;
  insertCategory: Database.Statement;
};

function prepareStatements() {
  stmts = {
    insertItem: db.prepare(`
      INSERT INTO items (id, name, year, rating, genres, description, categoryId, path, addedDate, coverPath, orderIndex, season, episode, watched, customFieldValues)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateItem: db.prepare(`
      UPDATE items SET name=?, year=?, rating=?, genres=?, description=?, categoryId=?, path=?, coverPath=?, orderIndex=?, season=?, episode=?, watched=?, customFieldValues=?
      WHERE id=?
    `),
    deleteItem: db.prepare('DELETE FROM items WHERE id = ?'),
    getItems: db.prepare('SELECT * FROM items WHERE categoryId = ? ORDER BY name LIMIT ? OFFSET ?'),
    searchFTS: db.prepare(`
      SELECT items.* FROM items_fts 
      JOIN items ON items.rowid = items_fts.rowid
      WHERE items_fts MATCH ?
      LIMIT ?
    `),
    insertCategory: db.prepare(`
      INSERT INTO categories (id, name, parentId, orderIndex, icon, emoji)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
  };
}

// IPC Handlers pre SQLite
function setupSQLiteIPC() {
  // Query - SELECT
  ipcMain.handle('sqlite:query', (_event, sql: string, params: any[] = []) => {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  });

  // Run - INSERT/UPDATE/DELETE
  ipcMain.handle('sqlite:run', (_event, sql: string, params: any[] = []) => {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  });

  // Exec - multiple statements
  ipcMain.handle('sqlite:exec', (_event, sql: string) => {
    db.exec(sql);
  });

  // Transaction - batch operations
  ipcMain.handle('sqlite:transaction', (_event, operations: Array<{ sql: string; params: any[] }>) => {
    const transaction = db.transaction(() => {
      for (const op of operations) {
        db.prepare(op.sql).run(...op.params);
      }
    });
    transaction();
  });

  // Batch insert items (10,000 items < 1s)
  ipcMain.handle('sqlite:batchInsertItems', (_event, items: any[]) => {
    const insertMany = db.transaction((items: any[]) => {
      for (const item of items) {
        stmts.insertItem.run(
          item.id, item.name, item.year, item.rating,
          JSON.stringify(item.genres), item.description,
          item.categoryId, item.path, item.addedDate,
          item.coverPath, item.orderIndex,
          item.season, item.episode, item.watched ? 1 : 0,
          item.customFieldValues ? JSON.stringify(item.customFieldValues) : null
        );
      }
    });
    insertMany(items);
    return { inserted: items.length };
  });

  // FTS Search (< 10ms)
  ipcMain.handle('sqlite:ftsSearch', (_event, query: string, limit = 50) => {
    const sanitized = query.replace(/['"]/g, '').trim().split(/\s+/).map(t => `${t}*`).join(' ');
    if (!sanitized) return [];
    try {
      return stmts.searchFTS.all(sanitized, limit);
    } catch (e) {
      console.warn('FTS failed:', e);
      return db.prepare('SELECT * FROM items WHERE name LIKE ? LIMIT ?').all(`%${query}%`, limit);
    }
  });

  // Database info
  ipcMain.handle('sqlite:getInfo', () => {
    const stats = fs.statSync(DB_PATH);
    const itemCount = db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number };
    return {
      size: stats.size,
      itemCount: itemCount.count,
      walMode: true,
      path: DB_PATH,
    };
  });

  // Vacuum
  ipcMain.handle('sqlite:vacuum', () => {
    db.exec('VACUUM');
  });

  // Backup
  ipcMain.handle('sqlite:backup', (_event, backupPath?: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = backupPath || path.join(BACKUP_DIR, `backup-${timestamp}.db`);
    db.backup(dest);
    return dest;
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
  initDatabase();
  prepareStatements();
  setupSQLiteIPC();
  setupImageIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    db.close();
    app.quit();
  }
});

app.on('before-quit', () => {
  db.close();
});

# Electron Setup Guide

Tento súbor obsahuje kompletný návod na integráciu SQLite storage do Electron aplikácie.

## 1. Vytvorenie Electron projektu

```bash
# Vytvor nový Electron projekt
npm create electron-vite@latest stuff-organizer-electron -- --template react-ts

# Alebo použi existujúci
cd stuff-organizer-electron
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

## 2. Main Process (electron/main.ts)

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database;

// Inicializácia databázy
function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'stuff_organizer.db');
  
  console.log('Database path:', dbPath);
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // Lepší výkon
  db.pragma('foreign_keys = ON');
}

// IPC handlery pre SQLite operácie
function setupIpcHandlers() {
  // Query - SELECT operácie
  ipcMain.handle('sqlite:query', async (_, sql: string, params: any[] = []) => {
    try {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      console.error('SQLite query error:', error);
      throw error;
    }
  });

  // Run - INSERT/UPDATE/DELETE operácie
  ipcMain.handle('sqlite:run', async (_, sql: string, params: any[] = []) => {
    try {
      const stmt = db.prepare(sql);
      const result = stmt.run(...params);
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    } catch (error) {
      console.error('SQLite run error:', error);
      throw error;
    }
  });

  // Exec - viac SQL príkazov naraz
  ipcMain.handle('sqlite:exec', async (_, sql: string) => {
    try {
      db.exec(sql);
    } catch (error) {
      console.error('SQLite exec error:', error);
      throw error;
    }
  });

  // Info - veľkosť databázy a počet položiek
  ipcMain.handle('sqlite:getInfo', async () => {
    try {
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM items');
      const count = countStmt.get() as { count: number };
      
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'stuff_organizer.db');
      const stats = fs.statSync(dbPath);
      
      return {
        size: stats.size,
        itemCount: count.count,
      };
    } catch (error) {
      return { size: 0, itemCount: 0 };
    }
  });
}

app.whenReady().then(() => {
  initDatabase();
  setupIpcHandlers();
  
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // V development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile('dist/index.html');
  }
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});
```

## 3. Image Storage IPC Handlers (electron/main.ts)

Pridaj tieto handlery pre ukladanie obrázkov ako súbory na disk:

```typescript
import sharp from 'sharp'; // npm install sharp - pre thumbnaily

// Adresáre pre obrázky
const imagesDir = path.join(app.getPath('userData'), 'images');
const thumbnailsDir = path.join(app.getPath('userData'), 'thumbnails');

// Vytvor adresáre ak neexistujú
function ensureImageDirs() {
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  if (!fs.existsSync(thumbnailsDir)) fs.mkdirSync(thumbnailsDir, { recursive: true });
}

function setupImageIpcHandlers() {
  ensureImageDirs();

  // Uložiť obrázok
  ipcMain.handle('images:save', async (_, itemId: string, data: ArrayBuffer, ext: string) => {
    const fileName = `${itemId}.${ext}`;
    const filePath = path.join(imagesDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(data));
    return filePath;
  });

  // Načítať obrázok
  ipcMain.handle('images:load', async (_, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) return null;
      const buffer = fs.readFileSync(filePath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch {
      return null;
    }
  });

  // Zmazať obrázok
  ipcMain.handle('images:delete', async (_, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        // Zmaž aj thumbnail
        const thumbPath = filePath.replace(imagesDir, thumbnailsDir);
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
      }
      return true;
    } catch {
      return false;
    }
  });

  // Získať cestu k obrázku
  ipcMain.handle('images:getPath', async (_, itemId: string) => {
    const extensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    for (const ext of extensions) {
      const filePath = path.join(imagesDir, `${itemId}.${ext}`);
      if (fs.existsSync(filePath)) return filePath;
    }
    return null;
  });

  // Získať cestu k thumbnailu
  ipcMain.handle('images:getThumbnailPath', async (_, itemId: string) => {
    const extensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    for (const ext of extensions) {
      const filePath = path.join(thumbnailsDir, `${itemId}.${ext}`);
      if (fs.existsSync(filePath)) return filePath;
    }
    return null;
  });

  // Vytvoriť thumbnail (vyžaduje sharp)
  ipcMain.handle('images:createThumbnail', async (_, sourcePath: string, itemId: string, maxWidth: number, maxHeight: number) => {
    try {
      const ext = path.extname(sourcePath).slice(1) || 'jpg';
      const thumbPath = path.join(thumbnailsDir, `${itemId}.${ext}`);
      
      await sharp(sourcePath)
        .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);
      
      return thumbPath;
    } catch (error) {
      console.error('Thumbnail creation failed:', error);
      return null;
    }
  });
}

// Zavolaj v app.whenReady()
app.whenReady().then(() => {
  initDatabase();
  setupIpcHandlers();
  setupImageIpcHandlers(); // ← Pridané
  // ...
});
```

## 4. Preload Script (electron/preload.ts)

```typescript
import { contextBridge, ipcRenderer } from 'electron';

// SQLite API
contextBridge.exposeInMainWorld('electronSQLite', {
  query: (sql: string, params?: any[]) => 
    ipcRenderer.invoke('sqlite:query', sql, params),
  run: (sql: string, params?: any[]) => 
    ipcRenderer.invoke('sqlite:run', sql, params),
  exec: (sql: string) => 
    ipcRenderer.invoke('sqlite:exec', sql),
  getInfo: () => 
    ipcRenderer.invoke('sqlite:getInfo'),
});

// Image Storage API
contextBridge.exposeInMainWorld('electronImages', {
  saveImage: (itemId: string, data: ArrayBuffer, extension: string) =>
    ipcRenderer.invoke('images:save', itemId, data, extension),
  loadImage: (filePath: string) =>
    ipcRenderer.invoke('images:load', filePath),
  deleteImage: (filePath: string) =>
    ipcRenderer.invoke('images:delete', filePath),
  getImagePath: (itemId: string) =>
    ipcRenderer.invoke('images:getPath', itemId),
  getThumbnailPath: (itemId: string) =>
    ipcRenderer.invoke('images:getThumbnailPath', itemId),
  createThumbnail: (sourcePath: string, itemId: string, maxWidth: number, maxHeight: number) =>
    ipcRenderer.invoke('images:createThumbnail', sourcePath, itemId, maxWidth, maxHeight),
});

contextBridge.exposeInMainWorld('isElectron', true);
```

## 5. Použitie LazyImage komponenty

```tsx
import { LazyImage } from '@/components/LazyImage';
import { filePathToUrl } from '@/lib/storage/ElectronImageStorage';

// V zozname položiek
<LazyImage
  src={filePathToUrl(item.coverPath)}
  alt={item.name}
  className="w-12 h-16 rounded"
/>
```

## 6. Aktualizuj storage/index.ts

```typescript
import { StorageAdapter, detectStorageType } from './StorageAdapter';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { IndexedDBAdapter } from './IndexedDBAdapter';
import { SQLiteAdapter } from './SQLiteAdapter';

export const createStorageAdapter = (): StorageAdapter => {
  // Detekcia Electron s SQLite
  if (typeof window !== 'undefined' && window.electronSQLite) {
    console.log('Using SQLite storage (Electron)');
    return new SQLiteAdapter();
  }
  
  // Web fallback
  if (typeof indexedDB !== 'undefined') {
    console.log('Using IndexedDB storage (Web)');
    return new IndexedDBAdapter();
  }
  
  console.log('Using localStorage storage (Fallback)');
  return new LocalStorageAdapter();
};
```

## 7. Migrácia existujúcich dát

Pri prvom spustení Electron verzie môžeš migrovať dáta z localStorage/IndexedDB:

```typescript
// V komponente alebo hooku
const migrateFromWeb = async () => {
  const webData = localStorage.getItem('stuff_organizer_db');
  if (webData && window.electronSQLite) {
    const parsed = JSON.parse(webData);
    const sqliteAdapter = new SQLiteAdapter();
    await sqliteAdapter.init();
    await sqliteAdapter.importData({
      version: 2,
      exportDate: new Date().toISOString(),
      categories: parsed.categories,
      items: parsed.items,
    });
    // Vymaž web dáta po úspešnej migrácii
    localStorage.removeItem('stuff_organizer_db');
  }
};
```

## 8. Štruktúra projektu

```
stuff-organizer-electron/
├── electron/
│   ├── main.ts          # Main process s SQLite + Image Storage
│   └── preload.ts       # IPC bridge
├── src/
│   ├── components/
│   │   └── LazyImage.tsx     # ← Lazy loading komponent
│   ├── lib/
│   │   └── storage/
│   │       ├── StorageAdapter.ts
│   │       ├── SQLiteAdapter.ts
│   │       ├── ElectronImageStorage.ts  # ← Image storage utilities
│   │       ├── IndexedDBAdapter.ts
│   │       └── index.ts
│   └── ... (zvyšok React aplikácie)
├── package.json
└── electron-builder.json
```

## 9. Build pre distribúciu

```json
// electron-builder.json
{
  "appId": "com.yourname.stufforganizer",
  "productName": "Stuff Organizer",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "electron/**/*"
  ],
  "win": {
    "target": "nsis"
  },
  "mac": {
    "target": "dmg"
  },
  "linux": {
    "target": "AppImage"
  }
}
```

```bash
# Dependencies pre Electron
npm install better-sqlite3 sharp
npm install -D @types/better-sqlite3 electron electron-builder

# Build
npm run build
npx electron-builder
```

## Výkon

SQLite s better-sqlite3 + file-based images zvládne:
- **Milióny položiek** bez problémov
- **Milióny obrázkov** - uložené ako súbory, nie v DB
- **< 10ms** query čas aj s 1M riadkov (s indexami)
- **Lazy loading** - len viditeľné obrázky sa načítajú
- **Thumbnaily** - malé preview pre rýchle zobrazenie
- **Atomické transakcie** - žiadna strata dát
- **WAL mode** - rýchle súbežné čítanie/zápis

## Tipy

1. **Bulk insert** - pre import tisícov položiek použi transakciu:
   ```typescript
   await sqlite.exec('BEGIN TRANSACTION');
   for (const item of items) {
     await sqlite.run('INSERT...', [...]);
   }
   await sqlite.exec('COMMIT');
   ```

2. **Full-text search** - pre rýchle vyhľadávanie pridaj FTS5:
   ```sql
   CREATE VIRTUAL TABLE items_fts USING fts5(name, description, genres);
   ```

3. **Vacuum** - občas zmenši databázu:
   ```typescript
   await sqlite.exec('VACUUM');
   ```

4. **Image preloading** - načítaj obrázky dopredu pri scrollovaní:
   ```typescript
   import { preloadImages } from '@/lib/storage/ElectronImageStorage';
   
   // Načítaj ďalších 20 obrázkov
   const nextPaths = visibleItems.slice(0, 20).map(i => i.coverPath);
   preloadImages(nextPaths);
   ```

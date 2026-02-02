# Electron SQLite Setup Guide

## Overview

Toto je kompletný návod na konfiguráciu natívneho SQLite (better-sqlite3) pre Electron verziu aplikácie. Táto konfigurácia umožňuje:

- **1,000,000+ položiek** s plynulým výkonom
- **FTS5 full-text search** v < 10ms
- **WAL mode** pre rýchle zápisové operácie
- **Batch inserts** 10,000 položiek za < 1 sekundu
- **100% offline** - žiadne API, žiadny cloud

## Očakávaný výkon

| Operácia | Očakávaný čas |
|----------|---------------|
| Insert 10,000 položiek | < 1 sekunda |
| Full-text search (1M items) | < 10ms |
| Filter + Sort (1M items) | < 50ms |
| Startup | < 500ms |
| RAM usage | < 100MB |
| Database size (1M items) | ~100-200MB |

## 1. Inštalácia závislostí

```bash
# V Electron projekte
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

## 2. Hlavný proces (main.ts)

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database path in user data directory
const dbPath = path.join(app.getPath('userData'), 'collection.db');

// Initialize database with optimized settings
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB cache
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O

// Prepared statements cache for maximum performance
const statements = new Map<string, Database.Statement>();

function getStatement(sql: string): Database.Statement {
  if (!statements.has(sql)) {
    statements.set(sql, db.prepare(sql));
  }
  return statements.get(sql)!;
}

// Initialize schema
db.exec(`
  -- Categories table
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parentId TEXT,
    orderIndex INTEGER DEFAULT 0,
    icon TEXT,
    emoji TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(orderIndex);

  -- Items table
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
    FOREIGN KEY (categoryId) REFERENCES categories(id)
  );
  
  -- Indexes for fast querying
  CREATE INDEX IF NOT EXISTS idx_items_category ON items(categoryId);
  CREATE INDEX IF NOT EXISTS idx_items_name ON items(name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_items_year ON items(year);
  CREATE INDEX IF NOT EXISTS idx_items_rating ON items(rating);
  CREATE INDEX IF NOT EXISTS idx_items_added ON items(addedDate);
  CREATE INDEX IF NOT EXISTS idx_items_order ON items(orderIndex);
  -- Composite indexes
  CREATE INDEX IF NOT EXISTS idx_items_cat_name ON items(categoryId, name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_items_cat_year ON items(categoryId, year DESC);
  CREATE INDEX IF NOT EXISTS idx_items_cat_rating ON items(categoryId, rating DESC);

  -- FTS5 Full-Text Search
  CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    name, 
    description,
    genres,
    content=items,
    content_rowid=rowid
  );

  -- Triggers for FTS sync
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

  -- Settings table
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- App state table
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Store schema version
  INSERT OR IGNORE INTO settings (key, value) VALUES ('schema_version', '2');
`);

// IPC Handlers for renderer process
ipcMain.handle('sqlite:query', (_, sql: string, params: any[] = []) => {
  const stmt = getStatement(sql);
  return stmt.all(...params);
});

ipcMain.handle('sqlite:run', (_, sql: string, params: any[] = []) => {
  const stmt = getStatement(sql);
  const result = stmt.run(...params);
  return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
});

ipcMain.handle('sqlite:exec', (_, sql: string) => {
  db.exec(sql);
});

// Batch insert for maximum performance
ipcMain.handle('sqlite:batchInsert', (_, tableName: string, columns: string[], rows: any[][]) => {
  const placeholders = columns.map(() => '?').join(',');
  const sql = `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`;
  const stmt = db.prepare(sql);
  
  const insertMany = db.transaction((rows: any[][]) => {
    for (const row of rows) {
      stmt.run(...row);
    }
  });
  
  insertMany(rows);
  return { inserted: rows.length };
});

// FTS5 Search
ipcMain.handle('sqlite:ftsSearch', (_, query: string, categoryId?: string, limit = 50) => {
  const sanitizedQuery = query
    .replace(/['"]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(term => `${term}*`)
    .join(' ');

  let sql = `
    SELECT items.* FROM items_fts 
    JOIN items ON items.rowid = items_fts.rowid
    WHERE items_fts MATCH ?
  `;
  const params: any[] = [sanitizedQuery];

  if (categoryId && categoryId !== 'all') {
    sql += ' AND items.categoryId = ?';
    params.push(categoryId);
  }

  sql += ' ORDER BY rank LIMIT ?';
  params.push(limit);

  const stmt = getStatement(sql);
  return stmt.all(...params);
});

// Database info
ipcMain.handle('sqlite:getInfo', () => {
  const stats = fs.statSync(dbPath);
  const countResult = db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number };
  const walMode = (db.pragma('journal_mode') as any)[0]?.journal_mode === 'wal';
  
  return {
    size: stats.size,
    itemCount: countResult.count,
    walMode,
  };
});

// Vacuum for maintenance
ipcMain.handle('sqlite:vacuum', () => {
  db.exec('VACUUM');
});

// Backup database
ipcMain.handle('sqlite:backup', (_, backupPath: string) => {
  db.backup(backupPath);
});

// Statistics
ipcMain.handle('sqlite:getStatistics', () => {
  const totalItems = (db.prepare('SELECT COUNT(*) as count FROM items').get() as any).count;
  const totalCategories = (db.prepare('SELECT COUNT(*) as count FROM categories').get() as any).count;
  
  const catCounts = db.prepare(
    'SELECT categoryId, COUNT(*) as count FROM items GROUP BY categoryId'
  ).all() as { categoryId: string; count: number }[];
  
  const avgRating = (db.prepare(
    'SELECT AVG(rating) as avg FROM items WHERE rating IS NOT NULL'
  ).get() as any)?.avg;
  
  const yearCounts = db.prepare(
    'SELECT year, COUNT(*) as count FROM items WHERE year IS NOT NULL GROUP BY year ORDER BY year'
  ).all() as { year: number; count: number }[];
  
  const stats = fs.statSync(dbPath);
  
  return {
    totalItems,
    totalCategories,
    databaseSizeBytes: stats.size,
    itemsPerCategory: Object.fromEntries(catCounts.map(c => [c.categoryId, c.count])),
    averageRating: avgRating,
    itemsByYear: Object.fromEntries(yearCounts.map(y => [y.year, y.count])),
  };
});

// Cleanup on app quit
app.on('before-quit', () => {
  statements.clear();
  db.close();
});
```

## 3. Preload Script (preload.ts)

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronSQLite', {
  query: <T = any>(sql: string, params?: any[]): Promise<T[]> =>
    ipcRenderer.invoke('sqlite:query', sql, params),
  
  run: (sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number }> =>
    ipcRenderer.invoke('sqlite:run', sql, params),
  
  exec: (sql: string): Promise<void> =>
    ipcRenderer.invoke('sqlite:exec', sql),
  
  batchInsert: (tableName: string, columns: string[], rows: any[][]): Promise<{ inserted: number }> =>
    ipcRenderer.invoke('sqlite:batchInsert', tableName, columns, rows),
  
  ftsSearch: (query: string, categoryId?: string, limit?: number): Promise<any[]> =>
    ipcRenderer.invoke('sqlite:ftsSearch', query, categoryId, limit),
  
  getInfo: (): Promise<{ size: number; itemCount: number; walMode: boolean }> =>
    ipcRenderer.invoke('sqlite:getInfo'),
  
  vacuum: (): Promise<void> =>
    ipcRenderer.invoke('sqlite:vacuum'),
  
  backup: (path: string): Promise<void> =>
    ipcRenderer.invoke('sqlite:backup', path),
  
  getStatistics: (): Promise<any> =>
    ipcRenderer.invoke('sqlite:getStatistics'),
});
```

## 4. Príklad použitia v Renderer

```typescript
// Vyhľadávanie (FTS5)
const results = await window.electronSQLite!.ftsSearch('shawshank', 'movies', 50);
// Výsledok: < 10ms aj s 1,000,000 položkami

// Batch insert (10,000 položiek za < 1s)
const items = Array.from({ length: 10000 }, (_, i) => [
  `id-${i}`,
  `Movie ${i}`,
  2020 + (i % 5),
  7.5 + Math.random() * 2,
  JSON.stringify(['Action', 'Drama']),
  `Description for movie ${i}`,
  'movies',
  `/path/to/movie/${i}`,
  new Date().toISOString(),
  '',
  i,
]);

await window.electronSQLite!.batchInsert(
  'items',
  ['id', 'name', 'year', 'rating', 'genres', 'description', 'categoryId', 'path', 'addedDate', 'coverPath', 'orderIndex'],
  items
);

// Štatistiky
const stats = await window.electronSQLite!.getStatistics();
console.log(`Database: ${stats.totalItems} items, ${stats.databaseSizeBytes / 1024 / 1024}MB`);

// Backup
await window.electronSQLite!.backup('/path/to/backup.db');
```

## 5. Optimalizované SQL Queries

```sql
-- Vyhľadávanie (FTS5) - < 10ms
SELECT items.* FROM items_fts 
JOIN items ON items.rowid = items_fts.rowid
WHERE items_fts MATCH 'shawshank*' 
ORDER BY rank
LIMIT 50;

-- Filter + Sort s pagination - < 50ms
SELECT * FROM items 
WHERE categoryId = 'movies' AND rating >= 8.0
ORDER BY year DESC 
LIMIT 50 OFFSET 0;

-- Agregácie (štatistiky) - < 100ms
SELECT 
  categoryId, 
  COUNT(*) as count, 
  AVG(rating) as avg_rating,
  MIN(year) as min_year,
  MAX(year) as max_year
FROM items 
GROUP BY categoryId;

-- Count s filter - < 10ms (vďaka indexom)
SELECT COUNT(*) FROM items WHERE categoryId = 'movies';
```

## 6. Image Storage (externé súbory)

Pre optimálny výkon s miliónmi položiek sa obrázky ukladajú ako externé súbory:

```typescript
// V main.ts
import sharp from 'sharp';

const imagesDir = path.join(app.getPath('userData'), 'images');
const thumbsDir = path.join(imagesDir, 'thumbnails');

// Vytvor priečinky
fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(thumbsDir, { recursive: true });

// Uložiť obrázok
ipcMain.handle('images:save', async (_, itemId: string, imageBuffer: ArrayBuffer) => {
  const imagePath = path.join(imagesDir, `${itemId}.jpg`);
  const thumbPath = path.join(thumbsDir, `${itemId}.jpg`);
  
  // Uložiť originál
  fs.writeFileSync(imagePath, Buffer.from(imageBuffer));
  
  // Vytvoriť thumbnail (200x300)
  await sharp(imagePath)
    .resize(200, 300, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toFile(thumbPath);
  
  return { imagePath, thumbPath };
});

// Načítať thumbnail
ipcMain.handle('images:getThumbnail', (_, itemId: string) => {
  const thumbPath = path.join(thumbsDir, `${itemId}.jpg`);
  if (fs.existsSync(thumbPath)) {
    return `file://${thumbPath}`;
  }
  return null;
});
```

## 7. Údržba databázy

```typescript
// Týždenný VACUUM (automaticky v background)
setInterval(async () => {
  await window.electronSQLite!.vacuum();
  console.log('Database vacuumed');
}, 7 * 24 * 60 * 60 * 1000); // 1 týždeň

// Automatický backup
setInterval(async () => {
  const backupPath = `backup-${Date.now()}.db`;
  await window.electronSQLite!.backup(backupPath);
  console.log(`Backup created: ${backupPath}`);
}, 24 * 60 * 60 * 1000); // 1 deň
```

## Progressive Enhancement Strategy

```typescript
// Automatické škálovanie podľa počtu položiek
async function getOptimalQueryStrategy(): Promise<'simple' | 'paginated' | 'virtualized' | 'aggressive'> {
  const count = await window.electronSQLite!.getInfo().then(i => i.itemCount);
  
  if (count < 1_000) return 'simple';        // SELECT * bez pagination
  if (count < 10_000) return 'paginated';    // LIMIT/OFFSET
  if (count < 100_000) return 'virtualized'; // + virtualizácia UI
  return 'aggressive';                        // + agresívny caching + FTS
}
```

## Kritické požiadavky - 100% OFFLINE

✅ SQLite .db súbor lokálne  
✅ better-sqlite3 (pre Electron)  
✅ Žiadne API calls  
✅ Žiadne cloud sync  
✅ Backup = copy .db file  
✅ Import/Export funguje offline  
✅ Všetko bundled

# SQLite-Only Storage Migration Guide

## Prehľad

Tento dokument popisuje kompletný prechod z kombinácie LocalStorage/IndexedDB/JSON na **SQLite-only** úložisko.

---

## 1. Architektúra

### Pred migráciou
```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   LocalStorage  │   │    IndexedDB    │   │   JSON Files    │
│   (UI state)    │   │  (sql.js blob)  │   │   (backups)     │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │
         └─────────────────────┴─────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │     useAppState     │
                    │   (hybrid state)    │
                    └─────────────────────┘
```

### Po migrácii
```
                    ┌─────────────────────┐
                    │      SQLite DB      │
                    │  (sql.js / better-  │
                    │      sqlite3)       │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │     useStorage      │
                    │   (unified hook)    │
                    └─────────────────────┘
```

---

## 2. SQLite Schéma (v4)

### Tabuľky

| Tabuľka | Účel |
|---------|------|
| `categories` | Kategórie s custom fields |
| `items` | Všetky položky (filmy, hry...) |
| `tags` | Flexibilný tagging systém |
| `item_tags` | Many-to-many vzťah |
| `notes` | Poznámky k položkám |
| `settings` | App nastavenia (key-value) |
| `ui_state` | UI stav (nie perzistentný) |
| `items_fts` | FTS5 full-text search |
| `schema_migrations` | Verzie schémy |

### Indexy pre výkon

```sql
-- Základné indexy
CREATE INDEX idx_items_category ON items(category_id);
CREATE INDEX idx_items_name ON items(name COLLATE NOCASE);
CREATE INDEX idx_items_year ON items(year);
CREATE INDEX idx_items_rating ON items(rating DESC);

-- Kompozitné indexy (najčastejšie queries)
CREATE INDEX idx_items_cat_name ON items(category_id, name COLLATE NOCASE);
CREATE INDEX idx_items_cat_year ON items(category_id, year DESC);
CREATE INDEX idx_items_cat_rating ON items(category_id, rating DESC);
```

---

## 3. Migračný proces

### Automatická migrácia

Pri prvom spustení `useStorage` hook:

1. Detekuje staré dáta v LocalStorage/IndexedDB
2. Načíta a normalizuje dáta
3. Vytvorí zálohu (`stuff_organizer_db_backup_*`)
4. Migruje do SQLite
5. Vymaže staré úložiská

```typescript
import { useStorage } from '@/hooks/useStorage';

const MyComponent = () => {
  const { state, isLoading, error } = useStorage();
  
  if (isLoading) return <Loading />;
  if (error) return <Error message={error} />;
  
  // Dáta sú v SQLite
  return <App state={state} />;
};
```

### Manuálna migrácia

```typescript
import { 
  checkLegacyData, 
  runFullMigration 
} from '@/lib/storage/migrations';
import { getStorage } from '@/lib/storage';

const migrate = async () => {
  // 1. Skontroluj staré dáta
  const legacy = await checkLegacyData();
  console.log('Legacy data:', legacy);
  
  // 2. Získaj SQLite adapter
  const adapter = await getStorage();
  
  // 3. Spusti migráciu
  const result = await runFullMigration(adapter, (msg, progress) => {
    console.log(`${progress}% - ${msg}`);
  });
  
  console.log('Migration result:', result);
};
```

---

## 4. CRUD Príklady

### Čítanie dát

```typescript
// Cez hook (odporúčané)
const { state, filteredItems } = useStorage();

// Priamo cez adapter
const adapter = await getStorage();
const items = await adapter.getItems({
  categoryId: 'movies',
  limit: 50,
  offset: 0,
  sortColumn: 'rating',
  sortDirection: 'desc',
});
```

### Vyhľadávanie (FTS5)

```typescript
// Cez hook
const { setSearchQuery } = useStorage();
setSearchQuery('matrix');

// Priamo (< 10ms na 1M položiek)
const adapter = await getStorage();
const results = await adapter.fullTextSearch('matrix', {
  categoryId: 'movies',
  limit: 50,
  matchMode: 'prefix', // autocomplete
});
```

### Zápis dát

```typescript
const { addItem, updateItem, deleteItems } = useStorage();

// Pridať
const newItem = addItem({
  name: 'The Matrix',
  year: 1999,
  rating: 8.7,
  categoryId: 'movies',
  genres: ['Sci-Fi', 'Action'],
  description: 'A computer hacker...',
  path: '/movies/matrix',
  coverPath: '',
  season: null,
  episode: null,
  watched: true,
});

// Aktualizovať
updateItem(newItem.id, { rating: 9.0 });

// Zmazať
deleteItems([newItem.id]);
```

### Batch operácie

```typescript
const adapter = await getStorage();

// Batch insert (10,000 items < 1s)
if (adapter.addItems) {
  await adapter.addItems(items, (count) => {
    console.log(`Inserted ${count} items`);
  });
}
```

---

## 5. Optimalizácia výkonu

### Pragma nastavenia

```sql
PRAGMA journal_mode = WAL;        -- Write-Ahead Logging
PRAGMA synchronous = NORMAL;      -- Rýchlejšie zápisy
PRAGMA cache_size = -64000;       -- 64MB cache
PRAGMA temp_store = MEMORY;       -- Temp tabuľky v RAM
PRAGMA mmap_size = 268435456;     -- 256MB memory-mapped I/O
```

### Výkon podľa počtu položiek

| Položky | Načítanie | Vyhľadávanie (FTS5) | Insert 1000 |
|---------|-----------|---------------------|-------------|
| 10,000 | ~100ms | <10ms | ~200ms |
| 100,000 | ~500ms | <10ms | ~500ms |
| 1,000,000 | ~2s | <10ms | ~1s |

### Tips

1. **Používaj FTS5 pre vyhľadávanie** - `fullTextSearch()` namiesto LIKE
2. **Indexuj stĺpce pre WHERE/ORDER BY** - pozri schému
3. **Batch operácie** - `addItems()` namiesto jednotlivých `addItem()`
4. **Debounce ukladanie** - hook má 1s debounce
5. **Lazy loading** - `getItems({ limit: 50, offset: 0 })`

---

## 6. Electron špecifiká

### Native SQLite (better-sqlite3)

V Electron verzii sa používa natívny SQLite cez IPC:

```typescript
// electron/main.ts - pripravené
// electron/preload.ts - pripravené

// V renderer procese
if (window.electronSQLite) {
  // Native SQLite cez IPC
  const items = await window.electronSQLite.query(
    'SELECT * FROM items WHERE category_id = ? LIMIT ?',
    ['movies', 50]
  );
  
  // FTS search
  const results = await window.electronSQLite.ftsSearch('matrix', 50);
  
  // Batch insert
  await window.electronSQLite.batchInsertItems(items);
}
```

### Obrázky v Electron

```typescript
if (window.electronImages) {
  // Uložiť (s automatickým thumbnailom)
  await window.electronImages.save('item-123', base64Data);
  
  // Načítať thumbnail
  const url = await window.electronImages.load('item-123', true);
}
```

---

## 7. Troubleshooting

### Migrácia zlyhala

```typescript
import { backupLegacyData, loadFromLocalStorage } from '@/lib/storage/migrations';

// Manuálna záloha
const backupKey = backupLegacyData();
console.log('Backup saved as:', backupKey);

// Načítať staré dáta
const data = loadFromLocalStorage();
console.log('Legacy data:', data);
```

### Reset databázy

```typescript
import { resetStorage } from '@/lib/storage';

// Resetuje singleton, pri ďalšom getStorage() sa vytvorí nová inštancia
resetStorage();
```

### Debug queries

```typescript
const adapter = await getStorage();
const info = await adapter.getStorageInfo();
console.log('Storage info:', info);

// SQLite specific
if (adapter.getStatistics) {
  const stats = await adapter.getStatistics();
  console.log('Statistics:', stats);
}
```

---

## 8. Kroky pre odstránenie starého kódu

### Čo zmazať

1. **`src/lib/database.ts`** - nahradené SQLite
2. **`src/lib/storage/LocalStorageAdapter.ts`** - deprecated
3. **`src/lib/storage/IndexedDBAdapter.ts`** - deprecated
4. **`src/hooks/useAppState.ts`** - nahradené useStorage

### Čo aktualizovať

1. **`src/components/StuffOrganizer.tsx`**
   ```typescript
   // Pred
   import { useAppState } from '@/hooks/useAppState';
   
   // Po
   import { useStorage } from '@/hooks/useStorage';
   ```

2. **`src/hooks/useFileSystemStorage.ts`**
   - Zvážiť odstránenie - SQLite je jediné úložisko

### Čo ponechať

1. **`src/lib/storage/WebSQLiteAdapter.ts`** - hlavný adapter
2. **`src/lib/storage/StorageAdapter.ts`** - interface
3. **`src/lib/storage/migrations.ts`** - migrácia (ponechať pre existujúcich užívateľov)
4. **`src/hooks/useStorage.ts`** - nový unified hook

---

## 9. Checklist

- [ ] Zálohovať existujúce dáta pred migráciou
- [ ] Otestovať migráciu na kópii databázy
- [ ] Overiť FTS5 vyhľadávanie
- [ ] Otestovať s 10,000+ položkami
- [ ] Aktualizovať importy v komponentoch
- [ ] Odstrániť deprecated súbory
- [ ] Aktualizovať README

# Stuff Organizer – Electron s natívnym SQLite

Desktopová aplikácia na organizáciu zbierok (filmy, seriály, hry, hudba, e-knihy, aplikácie) s natívnym SQLite backendom, optimalizovaná pre milióny položiek.

## Architektúra

```
%APPDATA%/stuff-organizer/          (Windows)
~/Library/Application Support/stuff-organizer/  (macOS)
~/.config/stuff-organizer/          (Linux)
├── stuff-organizer.db              # SQLite databáza (WAL mode)
├── images/                         # Originálne obrázky
│   └── <itemId>.jpg
├── thumbnails/                     # 200×280 JPEG thumbnaily
│   └── <itemId>.jpg
├── backups/                        # Zálohy databázy
└── window-state.json               # Poloha a veľkosť okna
```

## Požiadavky

- **Node.js** 18+ (odporúčaná 20 LTS)
- **npm** 9+
- **Python 3** (pre kompiláciu natívnych modulov)
- **C++ Build Tools:**
  - **Windows:** `npm install -g windows-build-tools` alebo nainštaluj [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) s workloadom "Desktop development with C++"
  - **macOS:** `xcode-select --install`
  - **Linux:** `sudo apt install build-essential python3` (Debian/Ubuntu) alebo `sudo dnf groupinstall "Development Tools"` (Fedora)

## Inštalácia

### 1. Klonovanie repozitára

```bash
git clone <URL_REPOZITÁRA>
cd stuff-organizer
```

### 2. Inštalácia hlavného projektu (web)

```bash
npm install
```

### 3. Inštalácia Electron závislostí

```bash
cd electron
npm install
```

> **Poznámka:** `npm install` automaticky stiahne a skompiluje natívne moduly `sqlite3` a `sharp` pre tvoju platformu. Ak kompilácia zlyhá, skontroluj sekciu [Troubleshooting](#troubleshooting).

### 4. Rebuild natívnych modulov pre Electron

```bash
npx @electron/rebuild
```

Toto zabezpečí, že `sqlite3` a `sharp` sú skompilované pre správnu verziu Electronu (nie systémového Node.js).

## Spustenie

### Development (s hot-reload)

```bash
cd electron
npm run dev
```

Toto spustí:
1. Vite dev server na `http://localhost:5173`
2. Electron okno, ktoré načíta dev server

### Production build

```bash
# Pre aktuálnu platformu
npm run dist

# Pre konkrétnu platformu
npm run dist:win      # Windows (NSIS installer + portable)
npm run dist:mac      # macOS (DMG + ZIP)
npm run dist:linux    # Linux (AppImage + DEB + RPM)

# Pre všetky platformy
npm run dist:all
```

## Funkcie

### SQLite databáza
- **WAL mode** – rýchle súbežné čítanie aj počas zápisov
- **FTS5** – full-text search s diakritikou (unicode61)
- **Indexy** na `name`, `year`, `rating`, `category_id`, `added_date`
- **Batch insert** – 5 000 položiek naraz v transakcii
- **12 GB RAM** alokácia pre veľké datasety

### Obrázky
- Ukladanie na disk (nie v databáze)
- Automatické generovanie thumbnailov (200×280 JPEG cez `sharp`)
- Lazy loading v UI

### Window Persistence
- Automatické ukladanie polohy a veľkosti okna
- Obnovenie stavu pri ďalšom spustení
- Podpora maximalizovaného stavu

### UI optimalizácie
- **React Virtuoso** – virtualizovaný zoznam pre 100k+ položiek
- **Web Worker Search** – vyhľadávanie beží mimo hlavné vlákno
- **Debounced search** – plynulé písanie bez lagov

## API v renderer procese

### window.electronDB

```typescript
if (window.electronDB) {
  // SQL operácie
  await window.electronDB.exec('VACUUM;');
  const rows = await window.electronDB.all('SELECT * FROM items LIMIT 10');
  const row = await window.electronDB.get('SELECT COUNT(*) as count FROM items');
  await window.electronDB.run('UPDATE items SET name = ? WHERE id = ?', ['Nový názov', 'abc123']);

  // Batch insert (5000 riadkov naraz)
  await window.electronDB.batchInsert(
    'INSERT INTO items (id, name, category_id) VALUES (?, ?, ?)',
    [['id1', 'Film 1', 'cat1'], ['id2', 'Film 2', 'cat1']]
  );

  // Export/Import databázy
  const dbData = await window.electronDB.exportDB();   // Uint8Array
  await window.electronDB.importDB(dbData);

  // Info
  const info = await window.electronDB.getInfo();
  console.log(`DB: ${info.path}, Size: ${info.size} bytes`);

  // Backup
  await window.electronDB.backup();
}
```

### window.electronImages

```typescript
if (window.electronImages) {
  // Ulož obrázok (s automatickým thumbnailom)
  const path = await window.electronImages.save('item-123', base64Data);

  // Načítaj obrázok
  const dataUrl = await window.electronImages.load(path);

  // Zmaž obrázok + thumbnail
  await window.electronImages.delete('item-123');
}
```

## Databázová schéma

```sql
-- Kategórie (filmy, hry, knihy...)
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES categories(id),
  order_index INTEGER DEFAULT 0,
  icon TEXT,
  emoji TEXT,
  custom_fields TEXT,      -- JSON
  enabled_fields TEXT       -- JSON
);

-- Položky
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER,
  rating REAL CHECK (rating >= 0 AND rating <= 10),
  genres TEXT,              -- JSON array
  description TEXT,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  path TEXT,
  added_date TEXT,
  cover_path TEXT,
  order_index INTEGER DEFAULT 0,
  season INTEGER,
  episode INTEGER,
  watched INTEGER DEFAULT 0,
  favorite INTEGER DEFAULT 0,
  custom_field_values TEXT  -- JSON
);

-- Full-text search
CREATE VIRTUAL TABLE items_fts USING fts5(
  name, description, genres, path,
  content=items, content_rowid=rowid
);
```

## Troubleshooting

### `sqlite3` kompilácia zlyháva

```bash
# Windows – nainštaluj build tools
npm install -g windows-build-tools

# Alebo manuálne rebuild
cd electron
npx @electron/rebuild -f -w sqlite3
```

### `sharp` nefunguje

```bash
cd electron
npm rebuild sharp
# alebo
npx @electron/rebuild -f -w sharp
```

### Biela obrazovka po spustení

1. Skontroluj, či existuje `dist/index.html` (spusti `npm run build` v hlavnom priečinku)
2. Skontroluj cestu v `electron/main.ts` → `loadFile`

### `NODE_MODULE_VERSION` mismatch

```bash
cd electron
npx @electron/rebuild
```

### Pomalý štart / veľká databáza

```bash
# V aplikácii: Database → Open Data Folder
# Skontroluj veľkosť stuff-organizer.db
# Ak je > 1 GB, spusti VACUUM cez export/import
```

## Výkonnostné limity

| Počet položiek | RAM použitie | Odozva UI | FTS5 Search |
|----------------|-------------|-----------|-------------|
| 10 000         | ~50 MB      | Okamžitá  | < 10 ms     |
| 100 000        | ~200 MB     | Okamžitá  | < 50 ms     |
| 1 000 000      | ~1.5 GB     | Plynulá   | < 200 ms    |
| 10 000 000     | ~8 GB       | Plynulá*  | < 500 ms    |

*S React Virtuoso a stránkovaním.

## 100% Offline

- ✅ Žiadne API calls
- ✅ Žiadne cloud závislosti
- ✅ Lokálna SQLite databáza
- ✅ Obrázky na disku
- ✅ Backup = kópia .db súboru

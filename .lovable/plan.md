
# Plán: Electron s JSON úložiskom (bez SQLite)

## Cieľ

Prepísať Electron verziu na JSON-only systém:
- **Main process**: Ukladá `data.json` na disk + obrázky ako súbory
- **Renderer**: Používa rovnaký `JSONStorageAdapter` s file system backendom
- **Odstránenie**: `better-sqlite3` závislosti

---

## Architektúra

```text
+------------------+       IPC Bridge        +------------------+
|    Renderer      | <--------------------> |   Main Process   |
|                  |                         |                  |
| JSONStorageAdapter                         | fs.readFileSync  |
| (detekuje Electron)                        | fs.writeFileSync |
|                  |                         |                  |
| Web: IndexedDB   |                         | data.json        |
| Electron: IPC    |                         | /images/*.jpg    |
+------------------+                         +------------------+
```

---

## Zmeny v súboroch

### 1. Nový Electron main.ts (prepísaný)

**Súbor**: `electron/main.ts`

Nahradí SQLite jednoduchým JSON súborom:

```text
- Cesty:
  - DATA_PATH = userData/data.json
  - IMAGES_DIR = userData/images/
  - BACKUP_DIR = userData/backups/

- IPC handlery:
  - json:load → načíta data.json
  - json:save → uloží data.json
  - json:export → vráti obsah data.json
  - json:import → nahradí data.json
  
  - images:save → uloží obrázok + thumbnail
  - images:load → vráti file:// URL
  - images:delete → zmaže obrázok
```

### 2. Nový preload.ts

**Súbor**: `electron/preload.ts`

Exponuje JSON API namiesto SQLite:

```text
window.electronJSON = {
  load: () => Promise<{ categories, items }>
  save: (data) => Promise<void>
  export: () => Promise<string> // JSON string
  import: (jsonString) => Promise<void>
  backup: () => Promise<string> // backup path
}

window.electronImages = {
  save: (id, data) => Promise<{ imagePath, thumbPath }>
  load: (id, thumbnail?) => Promise<string | null>
  delete: (id) => Promise<void>
}

window.electronApp = {
  isElectron: true
  platform: string
  version: string
}
```

### 3. Electron JSON Adapter

**Súbor**: `src/lib/storage/ElectronJSONAdapter.ts` (NOVÝ)

Wrapper pre IPC volania:

```text
class ElectronJSONAdapter implements StorageAdapter {
  
  async loadState() {
    const data = await window.electronJSON.load();
    return { categories: data.categories, items: data.items, ... };
  }
  
  async saveState(state) {
    await window.electronJSON.save({
      categories: state.categories,
      items: state.items
    });
  }
  
  // Ostatné metódy delegujú na window.electronJSON
}
```

### 4. Aktualizácia storage factory

**Súbor**: `src/lib/storage/index.ts`

Pridanie auto-detekcie Electron:

```text
export const createStorageAdapter = (): StorageAdapter => {
  // Detekuj Electron
  if (typeof window !== 'undefined' && window.electronJSON) {
    console.log('Using Electron JSON adapter (file system)');
    return new ElectronJSONAdapter();
  }
  
  // Web fallback
  console.log('Using Web JSON adapter (IndexedDB)');
  return new JSONStorageAdapter();
};
```

### 5. Aktualizácia electron/package.json

Odstránenie SQLite závislostí:

```text
dependencies: {
  "sharp": "^0.33.5"   // ponechať pre thumbnaily
  // ODSTRÁNENÉ: "better-sqlite3"
}

devDependencies: {
  // ODSTRÁNENÉ: "@types/better-sqlite3"
}
```

---

## Štruktúra dát na disku

```text
%APPDATA%/stuff-organizer/
├── data.json           # Hlavná databáza
├── images/
│   ├── item-123.jpg
│   ├── item-456.png
│   └── ...
├── thumbnails/
│   ├── item-123.jpg
│   └── ...
└── backups/
    ├── backup-2024-01-15.json
    └── ...
```

### Formát data.json

```text
{
  "version": 3,
  "lastModified": "2024-01-15T10:30:00Z",
  "categories": [...],
  "items": [...]
}
```

---

## Výkonnostné úvahy pre 5M položiek

### Problém: JSON loading time

5M položiek = ~500MB-1GB JSON súbor
- Načítanie: 5-15 sekúnd
- Parsovanie: 3-10 sekúnd
- Uloženie: 5-20 sekúnd

### Riešenie: Streaming + Chunking

```text
1. Rozdeliť data.json na chunky:
   - data/categories.json
   - data/items-0.json (položky 0-100k)
   - data/items-1.json (položky 100k-200k)
   - ...

2. Lazy loading:
   - Pri štarte načítať len kategórie
   - Položky načítať on-demand podľa kategórie

3. Incremental save:
   - Ukladať len zmenené chunky
   - Background save s debounce
```

### Alternatíva: ndjson (newline-delimited JSON)

```text
Pre 5M+ položiek - každý riadok je jeden item:
{"id":"1","name":"Matrix",...}
{"id":"2","name":"Inception",...}
...

Výhody:
- Streamované čítanie (nepotrebuje celý súbor v RAM)
- Rýchlejšie parsovanie
- Možnosť append-only zápisov
```

---

## Výhody tohto riešenia

| Aspekt | SQLite | JSON |
|--------|--------|------|
| Závislosť | better-sqlite3 (natívna) | Žiadna |
| Kompilácia | Potrebná (node-gyp) | Nie |
| Čitateľnosť dát | Binárne | Human-readable |
| Záloha | Kopírovanie .db | Kopírovanie .json |
| Portabilita | Komplikovaná | Jednoduchá |
| Škálovanie | Neobmedzené | ~500k bez chunking |

---

## Implementačný plán

### Fáza 1: Základná funkčnosť
1. Prepísať `electron/main.ts` - JSON IPC handlery
2. Prepísať `electron/preload.ts` - JSON API
3. Vytvoriť `ElectronJSONAdapter.ts`
4. Aktualizovať `index.ts` factory

### Fáza 2: Optimalizácie (voliteľné)
1. Implementovať chunking pre veľké datasety
2. Background save s progress
3. Streaming import/export

### Fáza 3: Čistenie
1. Odstrániť `better-sqlite3` z `package.json`
2. Aktualizovať dokumentáciu
3. Odstrániť SQLite schému a migrácie

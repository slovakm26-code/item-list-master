# Electron Setup - Stuff Organizer (JSON Storage)

## Prehľad

Electron verzia aplikácie Stuff Organizer s **JSON úložiskom** (bez SQLite).

**Výhody:**
- ✅ Žiadne natívne závislosti (node-gyp)
- ✅ Human-readable dáta (data.json)
- ✅ Jednoduchá záloha a migrácia
- ✅ Rýchla inštalácia bez kompilácie

## Architektúra

```
%APPDATA%/stuff-organizer/     (Windows)
~/Library/Application Support/stuff-organizer/  (macOS)
~/.config/stuff-organizer/     (Linux)
├── data.json                  # Hlavná databáza (kategórie + položky)
├── images/                    # Originálne obrázky
│   ├── abc123.jpg
│   └── def456.jpg
├── thumbnails/                # 200x280 thumbnaily
│   ├── abc123.jpg
│   └── def456.jpg
└── backups/                   # Zálohy
    └── backup-2024-01-15.json
```

## Inštalácia

```bash
cd electron
npm install
```

## Spustenie

```bash
# Development
npm run dev

# Production build
npm run dist

# Platform-specific
npm run dist:win
npm run dist:mac
npm run dist:linux
```

---

## API v renderer procese

### window.electronJSON

```typescript
// Detekcia Electron
if (window.electronJSON) {
  // Načítaj všetky dáta
  const data = await window.electronJSON.load();
  console.log(`Loaded ${data.items.length} items`);
  
  // Ulož dáta
  await window.electronJSON.save({ categories, items });
  
  // Info
  const info = await window.electronJSON.getInfo();
  console.log(`DB: ${info.path}, Size: ${info.size} bytes`);
  
  // Backup
  const backupPath = await window.electronJSON.backup();
}
```

### window.electronImages

```typescript
// Ulož obrázok
await window.electronImages.save('item-123', base64Data);

// Načítaj thumbnail
const url = await window.electronImages.load('item-123', true);

// Zmaž obrázok
await window.electronImages.delete('item-123');
```

---

## Porovnanie s SQLite

| Aspekt | SQLite | JSON |
|--------|--------|------|
| Závislosť | better-sqlite3 (natívna) | Žiadna |
| Kompilácia | Potrebná (node-gyp) | Nie |
| Čitateľnosť dát | Binárne | Human-readable |
| Záloha | Kopírovanie .db | Kopírovanie .json |
| Portabilita | Komplikovaná | Jednoduchá |
| Limit položiek | Neobmedzený | ~500k (RAM) |

---

## Troubleshooting

### sharp nefunguje

```bash
npm rebuild sharp
```

### Biela obrazovka

Skontroluj či `../dist/index.html` existuje.

---

## 100% Offline

- ✅ Žiadne API calls
- ✅ Žiadne cloud závislosti  
- ✅ Lokálny data.json súbor
- ✅ Obrázky na disku
- ✅ Backup = kópia súboru

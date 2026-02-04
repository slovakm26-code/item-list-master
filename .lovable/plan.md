
# Plán: Prechod na JSON-only úložisko

## Cieľ
Nahradiť SQLite (sql.js) jednoduchým JSON úložiskom, ktoré:
- Spoľahlivo funguje v prehliadači (IndexedDB)
- Bude fungovať aj v Electrone (file system)
- Má jednoduchý a spoľahlivý import/export

---

## Architektonické rozhodnutie

### Web verzia
- Dáta sa uložia ako JSON string do IndexedDB
- Pri štarte sa načíta celý JSON do pamäte
- Pri zmene sa debounced uloží späť

### Electron verzia (budúcnosť)
- Dáta sa uložia do `data.json` súboru
- Rovnaký formát, iný storage backend

---

## Zmeny v súboroch

### 1. Nový JSONStorageAdapter
**Súbor:** `src/lib/storage/JSONStorageAdapter.ts` (NOVÝ)

```text
Jednoduchý adapter:
- loadState(): načíta JSON z IndexedDB
- saveState(): uloží JSON do IndexedDB
- exportData(): vráti stav ako objekt
- importData(): nahradí stav
```

### 2. Úprava storage factory
**Súbor:** `src/lib/storage/index.ts`

```text
- createStorageAdapter() vráti JSONStorageAdapter namiesto WebSQLiteAdapter
- Zachová singleton pattern
```

### 3. Zjednodušenie useStorage
**Súbor:** `src/hooks/useStorage.ts`

```text
- Odstráni exportSQLite/importSQLite (binárny export)
- Pridá exportJSON/importJSON priamo (nie cez dialógy)
- Zjednoduší inicializáciu (žiadne migrations)
```

### 4. Úprava Toolbar
**Súbor:** `src/components/Toolbar.tsx`

```text
- Menu "Database" bude mať:
  - Export (JSON)
  - Import (JSON)
- Odstráni SQLite-specific možnosti
```

### 5. Čistenie starého kódu
**Súbory na odstránenie/zjednodušenie:**
- `src/lib/storage/WebSQLiteAdapter.ts` - odstrániť
- `src/lib/storage/SQLiteAdapter.ts` - odstrániť
- `src/lib/storage/migrations.ts` - zjednodušiť (iba legacy cleanup)
- `src/components/SQLiteImportDialog.tsx` - odstrániť

---

## Nový JSONStorageAdapter - Implementácia

### Štruktúra dát v IndexedDB

```text
Databáza: "stuff-organizer"
Object Store: "data"
Kľúč: "main"
Hodnota: { categories: [...], items: [...], version: 3 }
```

### Kľúčové metódy

```text
init()
- Otvorí IndexedDB
- Načíta existujúce dáta (ak sú)

loadState()
- Vráti kompletný AppState

saveState(state)
- Uloží celý stav ako JSON

exportData()
- Vráti { categories, items, images, version, exportDate }

importData(data)
- Validuje formát
- Nahradí celý stav
```

---

## Výhody nového riešenia

1. **Spoľahlivosť** - JSON je jednoduchý, žiadne binárne problémy
2. **Debugovateľnosť** - môžeš otvoriť export a skontrolovať
3. **Portabilita** - rovnaký súbor funguje všade
4. **Electron ready** - len zmeníš backend na file system
5. **Menší bundle** - nepotrebuješ sql.js WASM (2+ MB)

## Nevýhody

1. **Výkon pri veľkých dátach** - nad 100k položiek bude pomalšie
2. **Žiadne FTS** - vyhľadávanie bude in-memory (stále rýchle do 100k)

---

## Migrácia existujúcich dát

Pri prvom spustení:
1. Skontroluje či existuje SQLite databáza v IndexedDB
2. Ak áno, načíta dáta cez sql.js a prekonvertuje na JSON
3. Uloží do nového JSON formátu
4. Vymaže starú SQLite databázu

---

## Odhad rozsahu

- **Nové súbory:** 1 (JSONStorageAdapter.ts)
- **Upravené súbory:** 4 (index.ts, useStorage.ts, Toolbar.tsx, StuffOrganizer.tsx)
- **Odstránené súbory:** 3 (WebSQLiteAdapter.ts, SQLiteAdapter.ts, SQLiteImportDialog.tsx)
- **Čistý výsledok:** Menej kódu, väčšia spoľahlivosť

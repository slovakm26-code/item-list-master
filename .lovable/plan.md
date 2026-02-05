
# Plán: Prechod na JSON-only úložisko

## Stav: ✅ DOKONČENÉ

## Čo bolo urobené

### 1. Vytvorený JSONStorageAdapter
**Súbor:** `src/lib/storage/JSONStorageAdapter.ts` ✅
- Jednoduchý adapter s IndexedDB backendom
- Metódy: loadState(), saveState(), exportData(), importData()
- Pripravený na rozšírenie pre Electron (file system)

### 2. Aktualizovaná storage factory
**Súbor:** `src/lib/storage/index.ts` ✅
- createStorageAdapter() vracia JSONStorageAdapter
- Zachovaný singleton pattern

### 3. Zjednodušený useStorage hook
**Súbor:** `src/hooks/useStorage.ts` ✅
- Odstránený exportSQLite/importSQLite
- Zjednodušená inicializácia (žiadne migrations)

### 4. Upravený Toolbar
**Súbor:** `src/components/Toolbar.tsx` ✅
- Menu "Database" obsahuje len Export/Import JSON
- Odstránené SQLite-specific možnosti

### 5. Vyčistený starý kód
- `WebSQLiteAdapter.ts` - odstránený ✅
- `SQLiteAdapter.ts` - odstránený ✅
- `migrations.ts` - odstránený ✅
- `SQLiteImportDialog.tsx` - odstránený ✅
- `sql.js` dependency - odstránená ✅

---

## Výhody nového riešenia

1. **Spoľahlivosť** - JSON je jednoduchý, žiadne binárne problémy
2. **Debugovateľnosť** - export je čitateľný JSON súbor
3. **Portabilita** - rovnaký súbor funguje všade
4. **Electron ready** - len zmeníš backend na file system
5. **Menší bundle** - nepotrebuje sql.js WASM (2+ MB)

---

## Štruktúra dát v IndexedDB

```text
Databáza: "stuff-organizer-json"
Object Store: "data"
Kľúč: "main"
Hodnota: { categories: [...], items: [...], version: 3 }
```


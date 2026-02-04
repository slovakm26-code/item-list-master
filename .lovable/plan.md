
# Plán: Export a Import SQLite databázy

## Cieľ
Pridať možnosť exportovať a importovať celú SQLite databázu ako `.db` súbor, ktorý môžeš neskôr načítať späť.

## Čo už existuje
- `WebSQLiteAdapter.exportDatabase()` - vracia raw SQLite ako `Uint8Array`
- `WebSQLiteAdapter.importDatabase(data)` - importuje `Uint8Array` späť do databázy
- Toolbar s dropdown menu "Database"

## Zmeny

### 1. Pridanie funkcií do useStorage hooku
**Súbor:** `src/hooks/useStorage.ts`

Pridám dve nové funkcie:
- `exportSQLite()` - zavolá adapter.exportDatabase() a stiahne ako .db súbor
- `importSQLite(file)` - načíta .db súbor a zavolá adapter.importDatabase()

### 2. Aktualizácia Toolbar komponentu
**Súbor:** `src/components/Toolbar.tsx`

Do dropdown menu "Database" pridám:
- **Export SQLite** - stiahne databázu ako `stuff_organizer_TIMESTAMP.db`
- **Import SQLite** - načíta .db súbor a nahradí aktuálnu databázu

### 3. Aktualizácia StuffOrganizer
**Súbor:** `src/components/StuffOrganizer.tsx`

- Pridám nový ref pre input súbor pre SQLite import
- Prepojím handlery s novými funkciami

## Výsledok
V menu "Database" budeš mať:
- Export JSON (existujúce)
- Import JSON (existujúce)
- **Export SQLite** ← NOVÉ
- **Import SQLite** ← už existuje, využijeme
- Import SQLite (z inej aplikácie) ← existujúce

---

## Technické detaily

### Export SQLite
```text
1. Zavolá adapter.exportDatabase() → Uint8Array
2. Vytvorí Blob s typom 'application/x-sqlite3'
3. Stiahne ako stuff_organizer_YYYY-MM-DD.db
```

### Import SQLite
```text
1. Používateľ vyberie .db súbor
2. Načíta ako ArrayBuffer → Uint8Array
3. Zavolá adapter.importDatabase(data)
4. Refreshne stav aplikácie
```

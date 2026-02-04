/**
 * SQLite Migrations
 * Migrácia dát zo starých úložísk (LocalStorage, IndexedDB) do SQLite
 */

import { AppState, Category, Item } from '@/types';

// ============================================
// TYPY
// ============================================

interface MigrationResult {
  success: boolean;
  itemsCount: number;
  categoriesCount: number;
  errors: string[];
}

interface LegacyData {
  categories: Category[];
  items: Item[];
  settings?: Record<string, any>;
}

// ============================================
// 1. DETEKCIA STARÝCH DÁT
// ============================================

const LEGACY_LOCALSTORAGE_KEY = 'stuff_organizer_db';
// Note: We don't check IndexedDB anymore because the SQLite adapter
// uses IndexedDB for persistence (same name would conflict)

/**
 * Skontroluje či existujú staré dáta na migráciu
 * Only checks LocalStorage now - IndexedDB is used by SQLite adapter
 */
export const checkLegacyData = async (): Promise<{
  hasLocalStorage: boolean;
  hasIndexedDB: boolean;
  localStorageSize: number;
}> => {
  // Check LocalStorage only
  const lsData = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  const hasLocalStorage = !!lsData;
  const localStorageSize = lsData ? new Blob([lsData]).size : 0;

  // IndexedDB is now used by SQLite adapter, so we don't migrate from it
  // This prevents the false positive detection issue
  return { hasLocalStorage, hasIndexedDB: false, localStorageSize };
};

// ============================================
// 2. NAČÍTANIE STARÝCH DÁT
// ============================================

/**
 * Načíta dáta z LocalStorage
 */
export const loadFromLocalStorage = (): LegacyData | null => {
  try {
    const data = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
    if (!data) return null;

    const parsed = JSON.parse(data) as AppState;
    return {
      categories: parsed.categories || [],
      items: parsed.items || [],
      settings: {
        selectedCategoryId: parsed.selectedCategoryId,
        sortColumn: parsed.sortColumn,
        sortDirection: parsed.sortDirection,
        useManualOrder: parsed.useManualOrder,
      },
    };
  } catch (error) {
    console.error('Failed to load from LocalStorage:', error);
    return null;
  }
};

/**
 * Načíta dáta z IndexedDB (staré sql.js úložisko)
 * @deprecated IndexedDB is now used by SQLite adapter, this function is kept for compatibility
 */
export const loadFromIndexedDB = async (): Promise<Uint8Array | null> => {
  // This function is deprecated - we don't migrate from IndexedDB anymore
  // because SQLite adapter uses the same IndexedDB database
  return null;
};

// ============================================
// 3. TRANSFORMÁCIA DÁT
// ============================================

/**
 * Normalizuje kategoriu pre SQLite
 */
const normalizeCategory = (cat: Category): Category => ({
  id: cat.id,
  name: cat.name,
  parentId: cat.parentId || null,
  orderIndex: cat.orderIndex || 0,
  icon: cat.icon || null,
  emoji: cat.emoji || null,
  customFields: cat.customFields || undefined,
  enabledFields: cat.enabledFields || undefined,
});

/**
 * Normalizuje položku pre SQLite
 */
const normalizeItem = (item: Item): Item => ({
  id: item.id,
  name: item.name,
  year: item.year || null,
  rating: item.rating || null,
  genres: Array.isArray(item.genres) ? item.genres : [],
  description: item.description || '',
  categoryId: item.categoryId,
  path: item.path || '',
  addedDate: item.addedDate || new Date().toISOString(),
  coverPath: item.coverPath || '',
  orderIndex: item.orderIndex || 0,
  season: item.season || null,
  episode: item.episode || null,
  watched: item.watched || false,
  customFieldValues: item.customFieldValues || undefined,
});

// ============================================
// 4. MIGRÁCIA DO SQLITE
// ============================================

/**
 * Migruje dáta do SQLite cez WebSQLiteAdapter
 */
export const migrateToSQLite = async (
  adapter: { saveState: (state: AppState) => Promise<void>; isReady: () => boolean },
  data: LegacyData,
  onProgress?: (message: string, progress: number) => void
): Promise<MigrationResult> => {
  const errors: string[] = [];
  
  try {
    onProgress?.('Pripravujem migráciu...', 0);

    if (!adapter.isReady()) {
      throw new Error('SQLite adapter nie je pripravený');
    }

    // Normalizuj dáta
    onProgress?.('Normalizujem kategórie...', 10);
    const categories = data.categories.map(normalizeCategory);

    onProgress?.('Normalizujem položky...', 20);
    const items = data.items.map(normalizeItem);

    // Vytvor AppState
    const state: AppState = {
      categories,
      items,
      selectedCategoryId: data.settings?.selectedCategoryId || 'all',
      selectedItemIds: [],
      searchQuery: '',
      sortColumn: data.settings?.sortColumn || 'name',
      sortDirection: data.settings?.sortDirection || 'asc',
      useManualOrder: data.settings?.useManualOrder || false,
      customFieldFilters: [],
    };

    // Ulož do SQLite
    onProgress?.(`Ukladám ${categories.length} kategórií...`, 40);
    onProgress?.(`Ukladám ${items.length} položiek...`, 60);
    
    await adapter.saveState(state);

    onProgress?.('Migrácia dokončená!', 100);

    return {
      success: true,
      itemsCount: items.length,
      categoriesCount: categories.length,
      errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Neznáma chyba';
    errors.push(message);
    
    return {
      success: false,
      itemsCount: 0,
      categoriesCount: 0,
      errors,
    };
  }
};

// ============================================
// 5. VYČISTENIE STARÝCH DÁT
// ============================================

/**
 * Vytvorí zálohu pred vymazaním
 */
export const backupLegacyData = (): string | null => {
  const data = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  if (data) {
    const backupKey = `${LEGACY_LOCALSTORAGE_KEY}_backup_${Date.now()}`;
    localStorage.setItem(backupKey, data);
    return backupKey;
  }
  return null;
};

/**
 * Vymaže staré LocalStorage dáta
 */
export const clearLocalStorage = (): void => {
  localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
  
  // Vymaž aj staré zálohy (okrem poslednej)
  const backupKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('stuff_organizer_backup_')) {
      backupKeys.push(key);
    }
  }
  
  // Ponechaj poslednú zálohu
  backupKeys.sort().slice(0, -1).forEach(key => {
    localStorage.removeItem(key);
  });
};

/**
 * Vymaže staré IndexedDB dáta
 * @deprecated IndexedDB is now used by SQLite adapter
 */
export const clearIndexedDB = async (): Promise<void> => {
  // This function is deprecated - we don't clear IndexedDB anymore
  // because SQLite adapter uses the same IndexedDB database
  return Promise.resolve();
};

// ============================================
// 6. KOMPLETNÁ MIGRÁCIA
// ============================================

/**
 * Spustí kompletnú migráciu zo všetkých starých úložísk
 */
export const runFullMigration = async (
  adapter: { saveState: (state: AppState) => Promise<void>; isReady: () => boolean },
  onProgress?: (message: string, progress: number) => void
): Promise<MigrationResult> => {
  // 1. Skontroluj staré dáta
  onProgress?.('Kontrolujem staré úložiská...', 0);
  const legacy = await checkLegacyData();

  if (!legacy.hasLocalStorage && !legacy.hasIndexedDB) {
    return {
      success: true,
      itemsCount: 0,
      categoriesCount: 0,
      errors: [],
    };
  }

  // 2. Načítaj dáta (preferuj LocalStorage - novšie)
  onProgress?.('Načítavam staré dáta...', 10);
  const data = loadFromLocalStorage();

  if (!data) {
    return {
      success: false,
      itemsCount: 0,
      categoriesCount: 0,
      errors: ['Nepodarilo sa načítať staré dáta'],
    };
  }

  // 3. Vytvor zálohu
  onProgress?.('Vytváram zálohu...', 20);
  backupLegacyData();

  // 4. Migruj do SQLite
  const result = await migrateToSQLite(adapter, data, (msg, prog) => {
    onProgress?.(msg, 20 + prog * 0.7);
  });

  // 5. Ak úspešné, vyčisti staré dáta
  if (result.success) {
    onProgress?.('Čistím staré úložiská...', 95);
    clearLocalStorage();
    
    if (legacy.hasIndexedDB) {
      try {
        await clearIndexedDB();
      } catch (e) {
        result.errors.push('Nepodarilo sa vymazať IndexedDB');
      }
    }
  }

  onProgress?.('Hotovo!', 100);
  return result;
};

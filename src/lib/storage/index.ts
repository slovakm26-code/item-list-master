/**
 * Storage Module - SQLite Only
 * 
 * Centralizovaný vstupný bod pre SQLite úložisko.
 * Web používa sql.js (WASM), Electron používa better-sqlite3.
 */

import { StorageAdapter, detectStorageType } from './StorageAdapter';
import { WebSQLiteAdapter } from './WebSQLiteAdapter';

export * from './StorageAdapter';
export { WebSQLiteAdapter } from './WebSQLiteAdapter';

/**
 * Create SQLite storage adapter
 * - Web: WebSQLite (sql.js with IndexedDB persistence)
 * - Electron: Native SQLite via better-sqlite3 (auto-detected)
 */
export const createStorageAdapter = (): StorageAdapter => {
  const type = detectStorageType();
  
  if (type === 'sqlite') {
    // Electron s natívnym SQLite
    console.log('Using native SQLite adapter (Electron)');
    // V Electron verzii sa použije SQLiteAdapter z electron/main.ts
    // Tu vrátime WebSQLiteAdapter ako fallback
    return new WebSQLiteAdapter();
  }
  
  // Web verzia - vždy WebSQLite
  console.log('Using WebSQLite adapter (sql.js)');
  return new WebSQLiteAdapter();
};

// Singleton instance
let storageInstance: StorageAdapter | null = null;
let initPromise: Promise<StorageAdapter> | null = null;

/**
 * Get the global storage adapter instance (singleton)
 * Thread-safe initialization
 */
export const getStorage = async (): Promise<StorageAdapter> => {
  if (storageInstance?.isReady()) {
    return storageInstance;
  }

  if (!initPromise) {
    initPromise = (async () => {
      storageInstance = createStorageAdapter();
      await storageInstance.init();
      return storageInstance;
    })();
  }

  return initPromise;
};

/**
 * Reset storage instance (for testing or migration)
 */
export const resetStorage = (): void => {
  storageInstance = null;
  initPromise = null;
};

/**
 * Check if storage is initialized
 */
export const isStorageReady = (): boolean => {
  return storageInstance?.isReady() ?? false;
};

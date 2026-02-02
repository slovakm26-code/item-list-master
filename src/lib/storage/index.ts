import { StorageAdapter, detectStorageType } from './StorageAdapter';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { IndexedDBAdapter } from './IndexedDBAdapter';
import { WebSQLiteAdapter } from './WebSQLiteAdapter';

export * from './StorageAdapter';
export { LocalStorageAdapter } from './LocalStorageAdapter';
export { IndexedDBAdapter } from './IndexedDBAdapter';
export { WebSQLiteAdapter } from './WebSQLiteAdapter';

/**
 * Create the appropriate storage adapter based on environment
 * - Web: WebSQLite (sql.js with IndexedDB persistence) - DEFAULT for best performance
 * - Electron (future): Native SQLite via better-sqlite3
 * - Fallback: IndexedDB or localStorage
 */
export const createStorageAdapter = (preferSQLite = true): StorageAdapter => {
  const type = detectStorageType();
  
  // Default to WebSQLite for best performance with large datasets
  if (preferSQLite && type !== 'localStorage') {
    console.log('Using WebSQLite adapter (sql.js)');
    return new WebSQLiteAdapter();
  }
  
  switch (type) {
    case 'sqlite':
      // Electron native SQLite
      console.log('SQLite detected but not implemented yet, using WebSQLite');
      return new WebSQLiteAdapter();
      
    case 'indexedDB':
      return new IndexedDBAdapter();
      
    case 'localStorage':
    default:
      return new LocalStorageAdapter();
  }
};

// Singleton instance
let storageInstance: StorageAdapter | null = null;

/**
 * Get the global storage adapter instance
 */
export const getStorage = async (): Promise<StorageAdapter> => {
  if (!storageInstance) {
    storageInstance = createStorageAdapter();
    await storageInstance.init();
  }
  return storageInstance;
};

/**
 * Reset storage instance (for testing or migration)
 */
export const resetStorage = (): void => {
  storageInstance = null;
};

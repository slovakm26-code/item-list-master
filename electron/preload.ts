/**
 * Electron Preload Script
 * 
 * Vytvára bezpečný bridge medzi renderer a main procesom.
 * Exponuje API pre SQLite a obrázky cez contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

// SQLite API
contextBridge.exposeInMainWorld('electronSQLite', {
  // Query - SELECT statements
  query: <T = any>(sql: string, params?: any[]): Promise<T[]> => 
    ipcRenderer.invoke('sqlite:query', sql, params),

  // Run - INSERT/UPDATE/DELETE
  run: (sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number }> => 
    ipcRenderer.invoke('sqlite:run', sql, params),

  // Exec - multiple statements (CREATE TABLE, etc.)
  exec: (sql: string): Promise<void> => 
    ipcRenderer.invoke('sqlite:exec', sql),

  // Transaction - batch operations
  transaction: (operations: Array<{ sql: string; params: any[] }>): Promise<void> =>
    ipcRenderer.invoke('sqlite:transaction', operations),

  // Batch insert items (optimized for 10,000+ items)
  batchInsertItems: (items: any[]): Promise<{ inserted: number }> =>
    ipcRenderer.invoke('sqlite:batchInsertItems', items),

  // FTS Search (< 10ms for 1M items)
  ftsSearch: (query: string, limit?: number): Promise<any[]> =>
    ipcRenderer.invoke('sqlite:ftsSearch', query, limit),

  // Database info
  getInfo: (): Promise<{ size: number; itemCount: number; walMode: boolean; path: string }> => 
    ipcRenderer.invoke('sqlite:getInfo'),

  // Vacuum - cleanup database
  vacuum: (): Promise<void> => 
    ipcRenderer.invoke('sqlite:vacuum'),

  // Backup database
  backup: (path?: string): Promise<string> => 
    ipcRenderer.invoke('sqlite:backup', path),
});

// Images API
contextBridge.exposeInMainWorld('electronImages', {
  // Save image (returns file paths)
  save: (id: string, data: Buffer | string): Promise<{ imagePath: string; thumbPath: string }> =>
    ipcRenderer.invoke('images:save', id, data),

  // Load image URL
  load: (id: string, thumbnail?: boolean): Promise<string | null> =>
    ipcRenderer.invoke('images:load', id, thumbnail),

  // Delete image
  delete: (id: string): Promise<void> =>
    ipcRenderer.invoke('images:delete', id),

  // Batch save images
  batchSave: (images: Array<{ id: string; data: string }>): Promise<string[]> =>
    ipcRenderer.invoke('images:batchSave', images),
});

// App info
contextBridge.exposeInMainWorld('electronApp', {
  isElectron: true,
  platform: process.platform,
  version: process.env.npm_package_version || '1.0.0',
});

// Type declarations for renderer
declare global {
  interface Window {
    electronSQLite: {
      query: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
      run: (sql: string, params?: any[]) => Promise<{ changes: number; lastInsertRowid: number }>;
      exec: (sql: string) => Promise<void>;
      transaction: (operations: Array<{ sql: string; params: any[] }>) => Promise<void>;
      batchInsertItems: (items: any[]) => Promise<{ inserted: number }>;
      ftsSearch: (query: string, limit?: number) => Promise<any[]>;
      getInfo: () => Promise<{ size: number; itemCount: number; walMode: boolean; path: string }>;
      vacuum: () => Promise<void>;
      backup: (path?: string) => Promise<string>;
    };
    electronImages: {
      save: (id: string, data: Buffer | string) => Promise<{ imagePath: string; thumbPath: string }>;
      load: (id: string, thumbnail?: boolean) => Promise<string | null>;
      delete: (id: string) => Promise<void>;
      batchSave: (images: Array<{ id: string; data: string }>) => Promise<string[]>;
    };
    electronApp: {
      isElectron: boolean;
      platform: string;
      version: string;
    };
  }
}

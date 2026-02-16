/**
 * Electron API Type Declarations
 * 
 * Types for window.electronDB (SQLite), window.electronImages, and window.electronApp
 * exposed via preload script.
 */

interface ElectronDBAPI {
  // Execute SQL (INSERT, UPDATE, DELETE, CREATE)
  run: (sql: string, params?: any[]) => Promise<{ changes: number; lastInsertRowid: number }>;
  
  // Query single row
  get: (sql: string, params?: any[]) => Promise<any | null>;
  
  // Query multiple rows
  all: (sql: string, params?: any[]) => Promise<any[]>;
  
  // Execute multiple statements (for schema init)
  exec: (sql: string) => Promise<void>;
  
  // Batch insert (optimized with transaction)
  batchInsert: (sql: string, paramSets: any[][]) => Promise<number>;
  
  // Export database as binary
  exportDB: () => Promise<Uint8Array>;
  
  // Import database from binary
  importDB: (data: Uint8Array) => Promise<void>;
  
  // Backup database
  backup: () => Promise<string>;
  
  // Database info
  getInfo: () => Promise<{
    path: string;
    size: number;
    walSize: number;
  }>;
}

interface ElectronImagesAPI {
  save: (id: string, data: Buffer | string) => Promise<{ imagePath: string; thumbPath: string }>;
  load: (id: string, thumbnail?: boolean) => Promise<string | null>;
  delete: (id: string) => Promise<void>;
  batchSave: (images: Array<{ id: string; data: string }>) => Promise<string[]>;
}

interface ElectronAppAPI {
  isElectron: boolean;
  platform: string;
  version: string;
  openDataFolder: () => Promise<void>;
  getUserDataPath: () => Promise<string>;
}

declare global {
  interface Window {
    electronDB?: ElectronDBAPI;
    electronImages?: ElectronImagesAPI;
    electronApp?: ElectronAppAPI;
  }
}

export {};

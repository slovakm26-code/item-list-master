/**
 * Electron API Type Declarations
 * 
 * Types for window.electronJSON, window.electronImages, and window.electronApp
 * exposed via preload script.
 */

interface ElectronJSONAPI {
  // Initial load (first 2 chunks for instant UI)
  loadInitial: () => Promise<{
    categories: any[];
    items: any[];
    totalItems: number;
    chunkCount: number;
    loadedChunks: number;
  }>;
  
  // Load remaining chunks (background)
  loadRemainingChunks: (startChunk: number) => Promise<any[]>;
  
  // Full load (all chunks at once)
  load: () => Promise<{ version: number; lastModified: string; categories: any[]; items: any[] }>;
  
  // Save all data
  save: (data: { categories: any[]; items: any[] }) => Promise<void>;
  
  // Update single chunk (partial save)
  updateChunk: (chunkIndex: number, items: any[]) => Promise<void>;
  
  // Update categories only
  updateCategories: (categories: any[]) => Promise<void>;
  
  // Export/Import
  export: () => Promise<string>;
  import: (jsonString: string) => Promise<{ success: boolean; items: number; categories: number }>;
  
  // Backup
  backup: () => Promise<string>;
  
  // Storage info
  getInfo: () => Promise<{
    path: string;
    size: number;
    itemCount: number;
    categoryCount: number;
    chunkCount: number;
    chunkSize: number;
    lastModified: string;
  }>;
}

interface ElectronImagesAPI {
  save: (id: string, data: Buffer | string) => Promise<{ imagePath: string; thumbPath: string }>;
  load: (id: string, thumbnail?: boolean) => Promise<string | null>;
  delete: (id: string) => Promise<void>;
  deleteImage?: (id: string) => Promise<void>; // Alias for compatibility
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
    electronJSON?: ElectronJSONAPI;
    electronImages?: ElectronImagesAPI;
    electronApp?: ElectronAppAPI;
  }
}

export {};

/**
 * Electron Preload Script - Chunked JSON Storage API
 * 
 * Exposes secure IPC bridge for:
 * - Chunked JSON data operations (lazy loading, partial updates)
 * - Image management
 * - App utilities (open data folder)
 */

import { contextBridge, ipcRenderer } from 'electron';

// Chunked JSON Storage API
contextBridge.exposeInMainWorld('electronJSON', {
  // Initial load (first 2 chunks for instant UI)
  loadInitial: (): Promise<{
    categories: any[];
    items: any[];
    totalItems: number;
    chunkCount: number;
    loadedChunks: number;
  }> => ipcRenderer.invoke('json:loadInitial'),
  
  // Load remaining chunks (background)
  loadRemainingChunks: (startChunk: number): Promise<any[]> =>
    ipcRenderer.invoke('json:loadRemainingChunks', startChunk),
  
  // Full load (all chunks at once)
  load: (): Promise<{ version: number; lastModified: string; categories: any[]; items: any[] }> =>
    ipcRenderer.invoke('json:load'),
  
  // Save all data
  save: (data: { categories: any[]; items: any[] }): Promise<void> =>
    ipcRenderer.invoke('json:save', data),
  
  // Update single chunk (partial save)
  updateChunk: (chunkIndex: number, items: any[]): Promise<void> =>
    ipcRenderer.invoke('json:updateChunk', chunkIndex, items),
  
  // Update categories only
  updateCategories: (categories: any[]): Promise<void> =>
    ipcRenderer.invoke('json:updateCategories', categories),
  
  // Export/Import
  export: (): Promise<string> =>
    ipcRenderer.invoke('json:export'),
  import: (jsonString: string): Promise<{ success: boolean; items: number; categories: number }> =>
    ipcRenderer.invoke('json:import', jsonString),
  
  // Backup
  backup: (): Promise<string> =>
    ipcRenderer.invoke('json:backup'),
  
  // Storage info
  getInfo: (): Promise<{
    path: string;
    size: number;
    itemCount: number;
    categoryCount: number;
    chunkCount: number;
    chunkSize: number;
    lastModified: string;
  }> => ipcRenderer.invoke('json:getInfo'),
});

// Images API
contextBridge.exposeInMainWorld('electronImages', {
  save: (id: string, data: Buffer | string): Promise<{ imagePath: string; thumbPath: string }> =>
    ipcRenderer.invoke('images:save', id, data),
  load: (id: string, thumbnail?: boolean): Promise<string | null> =>
    ipcRenderer.invoke('images:load', id, thumbnail),
  delete: (id: string): Promise<void> =>
    ipcRenderer.invoke('images:delete', id),
  batchSave: (images: Array<{ id: string; data: string }>): Promise<string[]> =>
    ipcRenderer.invoke('images:batchSave', images),
});

// App utilities
contextBridge.exposeInMainWorld('electronApp', {
  isElectron: true,
  platform: process.platform,
  version: process.env.npm_package_version || '1.0.0',
  openDataFolder: (): Promise<void> =>
    ipcRenderer.invoke('app:openDataFolder'),
  getUserDataPath: (): Promise<string> =>
    ipcRenderer.invoke('app:getUserDataPath'),
});

console.log('Electron preload: Chunked JSON API exposed');

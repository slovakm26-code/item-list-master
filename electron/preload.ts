/**
 * Electron Preload Script - JSON Storage Version
 * 
 * Vytvára bezpečný bridge medzi renderer a main procesom.
 * Exponuje API pre JSON úložisko a obrázky cez contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

// JSON Storage API
contextBridge.exposeInMainWorld('electronJSON', {
  // Load all data from data.json
  load: (): Promise<{ version: number; lastModified: string; categories: any[]; items: any[] }> =>
    ipcRenderer.invoke('json:load'),

  // Save all data to data.json
  save: (data: { categories: any[]; items: any[] }): Promise<void> =>
    ipcRenderer.invoke('json:save', data),

  // Export as JSON string
  export: (): Promise<string> =>
    ipcRenderer.invoke('json:export'),

  // Import from JSON string
  import: (jsonString: string): Promise<{ success: boolean; items: number; categories: number }> =>
    ipcRenderer.invoke('json:import', jsonString),

  // Create backup
  backup: (): Promise<string> =>
    ipcRenderer.invoke('json:backup'),

  // Get storage info
  getInfo: (): Promise<{ path: string; size: number; itemCount: number; categoryCount: number; lastModified: string }> =>
    ipcRenderer.invoke('json:getInfo'),
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
    electronJSON?: {
      load: () => Promise<{ version: number; lastModified: string; categories: any[]; items: any[] }>;
      save: (data: { categories: any[]; items: any[] }) => Promise<void>;
      export: () => Promise<string>;
      import: (jsonString: string) => Promise<{ success: boolean; items: number; categories: number }>;
      backup: () => Promise<string>;
      getInfo: () => Promise<{ path: string; size: number; itemCount: number; categoryCount: number; lastModified: string }>;
    };
    electronImages?: {
      save: (id: string, data: Buffer | string) => Promise<{ imagePath: string; thumbPath: string }>;
      load: (id: string, thumbnail?: boolean) => Promise<string | null>;
      delete: (id: string) => Promise<void>;
      batchSave: (images: Array<{ id: string; data: string }>) => Promise<string[]>;
    };
    electronApp?: {
      isElectron: boolean;
      platform: string;
      version: string;
    };
  }
}

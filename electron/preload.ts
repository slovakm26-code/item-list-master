/**
 * Electron Preload Script - SQLite Storage API
 * 
 * Exposes secure IPC bridge for:
 * - SQLite database operations via sql.js
 * - Image management
 * - App utilities
 */

import { contextBridge, ipcRenderer } from 'electron';

// SQLite Database API
contextBridge.exposeInMainWorld('electronDB', {
  run: (sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number }> =>
    ipcRenderer.invoke('db:run', sql, params),

  get: (sql: string, params?: any[]): Promise<any | null> =>
    ipcRenderer.invoke('db:get', sql, params),

  all: (sql: string, params?: any[]): Promise<any[]> =>
    ipcRenderer.invoke('db:all', sql, params),

  exec: (sql: string): Promise<void> =>
    ipcRenderer.invoke('db:exec', sql),

  batchInsert: (sql: string, paramSets: any[][]): Promise<number> =>
    ipcRenderer.invoke('db:batchInsert', sql, paramSets),

  exportDB: (): Promise<Uint8Array> =>
    ipcRenderer.invoke('db:exportDB'),

  importDB: (data: Uint8Array): Promise<void> =>
    ipcRenderer.invoke('db:importDB', data),

  backup: (): Promise<string> =>
    ipcRenderer.invoke('db:backup'),

  getInfo: (): Promise<{ path: string; size: number; walSize: number }> =>
    ipcRenderer.invoke('db:getInfo'),
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

console.log('Electron preload: SQLite API exposed');

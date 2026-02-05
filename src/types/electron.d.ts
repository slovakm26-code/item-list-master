/**
 * Electron API Type Declarations
 * 
 * Definuje typy pre window.electronJSON, window.electronImages a window.electronApp
 * ktoré sú exponované cez preload script.
 */

interface ElectronJSONAPI {
  load: () => Promise<{ version: number; lastModified: string; categories: any[]; items: any[] }>;
  save: (data: { categories: any[]; items: any[] }) => Promise<void>;
  export: () => Promise<string>;
  import: (jsonString: string) => Promise<{ success: boolean; items: number; categories: number }>;
  backup: () => Promise<string>;
  getInfo: () => Promise<{ path: string; size: number; itemCount: number; categoryCount: number; lastModified: string }>;
}

interface ElectronAppAPI {
  isElectron: boolean;
  platform: string;
  version: string;
}

declare global {
  interface Window {
    electronJSON?: ElectronJSONAPI;
    electronApp?: ElectronAppAPI;
  }
}

export {};
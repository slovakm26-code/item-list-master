/**
 * Electron Image Storage Module
 * 
 * Handles image storage as separate files on disk for optimal performance
 * with large datasets (millions of images).
 * 
 * SETUP: This requires the Electron main process to expose file system APIs.
 * See electron-setup.md for the complete IPC bridge setup.
 */

// Type for Electron IPC (will be injected via preload script)
declare global {
  interface Window {
    electronImages?: {
      // New simplified API (from preload.ts)
      save?: (id: string, data: Buffer | string) => Promise<{ imagePath: string; thumbPath: string }>;
      load?: (id: string, thumbnail?: boolean) => Promise<string | null>;
      delete?: (id: string) => Promise<void>;
      batchSave?: (images: Array<{ id: string; data: string }>) => Promise<string[]>;
      // Legacy API (for backwards compatibility)
      saveImage: (itemId: string, data: ArrayBuffer, extension: string) => Promise<string>;
      loadImage: (filePath: string) => Promise<ArrayBuffer | null>;
      deleteImage: (filePath: string) => Promise<boolean>;
      getImagePath: (itemId: string) => Promise<string | null>;
      getThumbnailPath: (itemId: string) => Promise<string | null>;
      createThumbnail: (sourcePath: string, itemId: string, maxWidth: number, maxHeight: number) => Promise<string>;
    };
  }
}

export interface ImageStorageConfig {
  imagesDir: string;      // Directory for full-size images
  thumbnailsDir: string;  // Directory for thumbnails
  thumbnailMaxWidth: number;
  thumbnailMaxHeight: number;
}

const DEFAULT_CONFIG: ImageStorageConfig = {
  imagesDir: 'images',
  thumbnailsDir: 'thumbnails',
  thumbnailMaxWidth: 200,
  thumbnailMaxHeight: 300,
};

/**
 * Check if running in Electron with image storage support
 */
export const isElectronImageStorageAvailable = (): boolean => {
  return typeof window !== 'undefined' && !!window.electronImages;
};

/**
 * Save an image file for an item
 * @param itemId - The item's unique ID
 * @param imageData - Image data as ArrayBuffer
 * @param extension - File extension (e.g., 'jpg', 'png')
 * @returns The file path where the image was saved
 */
export const saveItemImage = async (
  itemId: string,
  imageData: ArrayBuffer,
  extension: string
): Promise<string> => {
  if (!window.electronImages) {
    throw new Error('Electron image storage not available');
  }
  
  return window.electronImages.saveImage(itemId, imageData, extension);
};

/**
 * Load an image from disk
 * @param filePath - Path to the image file
 * @returns Image data as ArrayBuffer, or null if not found
 */
export const loadImage = async (filePath: string): Promise<ArrayBuffer | null> => {
  if (!window.electronImages) {
    return null;
  }
  
  return window.electronImages.loadImage(filePath);
};

/**
 * Convert ArrayBuffer to data URL for display
 */
export const arrayBufferToDataUrl = (buffer: ArrayBuffer, mimeType: string): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
};

/**
 * Convert file path to file:// URL for Electron
 */
export const filePathToUrl = (filePath: string): string => {
  // Handle Windows paths
  if (filePath.includes('\\')) {
    filePath = filePath.replace(/\\/g, '/');
  }
  
  // Add file:// protocol if not present
  if (!filePath.startsWith('file://') && !filePath.startsWith('data:')) {
    return `file://${filePath}`;
  }
  
  return filePath;
};

/**
 * Delete an image file
 */
export const deleteItemImage = async (filePath: string): Promise<boolean> => {
  if (!window.electronImages) {
    return false;
  }
  
  return window.electronImages.deleteImage(filePath);
};

/**
 * Image cache for lazy loading
 * Keeps recently accessed images in memory for fast repeated access
 */
class ImageCache {
  private cache = new Map<string, { data: string; timestamp: number }>();
  private maxSize: number;
  private maxAge: number; // milliseconds

  constructor(maxSize = 100, maxAgeSeconds = 300) {
    this.maxSize = maxSize;
    this.maxAge = maxAgeSeconds * 1000;
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: string): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = [...this.cache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) {
        this.cache.delete(oldest[0]);
      }
    }

    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

// Global image cache instance
export const imageCache = new ImageCache(100, 300);

/**
 * Load image with caching for lazy loading
 * Returns a data URL that can be used directly in <img> tags
 */
export const loadImageWithCache = async (
  filePath: string,
  mimeType = 'image/jpeg'
): Promise<string | null> => {
  // Check cache first
  const cached = imageCache.get(filePath);
  if (cached) return cached;

  // For file:// URLs or regular paths in Electron
  if (isElectronImageStorageAvailable()) {
    const data = await loadImage(filePath);
    if (data) {
      const dataUrl = arrayBufferToDataUrl(data, mimeType);
      imageCache.set(filePath, dataUrl);
      return dataUrl;
    }
    return null;
  }

  // For web - if it's already a data URL or http URL, return as-is
  if (filePath.startsWith('data:') || filePath.startsWith('http')) {
    return filePath;
  }

  return null;
};

/**
 * Batch preload images (useful when scrolling through list)
 */
export const preloadImages = async (
  filePaths: string[],
  mimeType = 'image/jpeg'
): Promise<void> => {
  await Promise.allSettled(
    filePaths.map(path => loadImageWithCache(path, mimeType))
  );
};

/**
 * Export/Import module with embedded images
 * Allows backup files to contain all cover images for portability
 */

import { AppState, DatabaseExport, Item, Category } from '@/types';
import { getTimestamp, generateId } from './database';

// Convert File/Blob to base64 string
export const fileToBase64 = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix if present
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Convert base64 string to Blob
export const base64ToBlob = (base64: string, mimeType: string = 'image/jpeg'): Blob => {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  
  return new Blob([ab], { type: mimeType });
};

// Get MIME type from filename
export const getMimeType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
  };
  return mimeTypes[ext || ''] || 'image/jpeg';
};

// Create export with embedded images
export const createExportWithImages = async (
  state: AppState,
  loadImageFn?: (filename: string) => Promise<string | null>
): Promise<DatabaseExport> => {
  const images: Record<string, string> = {};
  
  // Load all cover images if function provided
  if (loadImageFn) {
    for (const item of state.items) {
      if (item.coverPath && item.coverPath.startsWith('images/')) {
        const filename = item.coverPath.replace('images/', '');
        try {
          const objectUrl = await loadImageFn(filename);
          if (objectUrl) {
            // Fetch the blob from object URL and convert to base64
            const response = await fetch(objectUrl);
            const blob = await response.blob();
            const base64 = await fileToBase64(blob);
            images[item.id] = base64;
            // Clean up object URL
            URL.revokeObjectURL(objectUrl);
          }
        } catch (error) {
          console.warn(`Failed to load image for item ${item.id}:`, error);
        }
      }
    }
  }
  
  return {
    version: 2, // New version with images support
    exportDate: new Date().toISOString(),
    categories: state.categories,
    items: state.items,
    images: Object.keys(images).length > 0 ? images : undefined,
  };
};

// Download export with images
export const downloadExportWithImages = async (
  state: AppState,
  loadImageFn?: (filename: string) => Promise<string | null>
): Promise<void> => {
  const data = await createExportWithImages(state, loadImageFn);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stuff_organizer_backup_${getTimestamp()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Import database with images
export const importDatabaseWithImages = async (
  file: File,
  saveImageFn?: (imageBlob: Blob, itemId: string, extension: string) => Promise<string>
): Promise<{
  categories: Category[];
  items: Item[];
}> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as DatabaseExport;
        
        // Validate basic structure
        if (!data.categories || !data.items) {
          throw new Error('Invalid database file format');
        }
        
        // Process items - restore images if present and save function provided
        const processedItems: Item[] = [];
        
        for (const item of data.items) {
          let newCoverPath = item.coverPath;
          
          // If we have embedded image data and a save function
          if (data.images && data.images[item.id] && saveImageFn) {
            try {
              // Determine MIME type from existing coverPath or default
              const mimeType = item.coverPath ? getMimeType(item.coverPath) : 'image/jpeg';
              const extension = mimeType.split('/')[1] || 'jpg';
              
              // Convert base64 to blob and save
              const blob = base64ToBlob(data.images[item.id], mimeType);
              const filename = await saveImageFn(blob, item.id, extension);
              newCoverPath = `images/${filename}`;
            } catch (error) {
              console.warn(`Failed to restore image for item ${item.id}:`, error);
            }
          }
          
          processedItems.push({
            ...item,
            coverPath: newCoverPath,
          });
        }
        
        resolve({
          categories: data.categories,
          items: processedItems,
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

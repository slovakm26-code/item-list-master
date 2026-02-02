/**
 * File System Access API module for persistent storage on disk/USB
 * Stores data in user-selected directory with db.json and /images/ folder
 */

import { AppState, Item, Category } from '@/types';

const DB_FILE_NAME = 'db.json';
const IMAGES_FOLDER = 'images';
const HANDLE_STORE_NAME = 'directoryHandles';
const HANDLE_KEY = 'mainDirectory';

// Extend Window interface for File System Access API
declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite';
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }): Promise<FileSystemDirectoryHandle>;
  }
  
  interface FileSystemDirectoryHandle {
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}

// IndexedDB for storing directory handle
const openHandleDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('StuffOrganizerHandles', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME);
      }
    };
  });
};

// Save directory handle to IndexedDB
export const saveDirectoryHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(HANDLE_STORE_NAME);
    const request = store.put(handle, HANDLE_KEY);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
};

// Get saved directory handle from IndexedDB
export const getSavedDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
      const store = tx.objectStore(HANDLE_STORE_NAME);
      const request = store.get(HANDLE_KEY);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
};

// Request permission for saved handle
export const requestPermission = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
  try {
    const options = { mode: 'readwrite' as const };
    
    if ((await handle.queryPermission(options)) === 'granted') {
      return true;
    }
    
    if ((await handle.requestPermission(options)) === 'granted') {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
};

// Show directory picker and save handle
export const selectDirectory = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API is not supported in this browser');
    }
    
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    });
    
    await saveDirectoryHandle(handle);
    
    try {
      await handle.getDirectoryHandle(IMAGES_FOLDER, { create: true });
    } catch {
      // Folder might already exist
    }
    
    return handle;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return null;
    }
    throw error;
  }
};

// Get or request directory handle
export const getDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  const savedHandle = await getSavedDirectoryHandle();
  
  if (savedHandle) {
    const hasPermission = await requestPermission(savedHandle);
    if (hasPermission) {
      return savedHandle;
    }
  }
  
  return null;
};

// Save database to db.json in selected directory
export const saveToFileSystem = async (
  handle: FileSystemDirectoryHandle,
  state: AppState
): Promise<void> => {
  try {
    const fileHandle = await handle.getFileHandle(DB_FILE_NAME, { create: true });
    const writable = await fileHandle.createWritable();
    
    const data = {
      version: 1,
      lastModified: new Date().toISOString(),
      categories: state.categories,
      items: state.items,
    };
    
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  } catch (error) {
    console.error('Failed to save to file system:', error);
    throw error;
  }
};

// Load database from db.json
export const loadFromFileSystem = async (
  handle: FileSystemDirectoryHandle
): Promise<{ categories: Category[]; items: Item[] } | null> => {
  try {
    const fileHandle = await handle.getFileHandle(DB_FILE_NAME);
    const file = await fileHandle.getFile();
    const content = await file.text();
    const data = JSON.parse(content);
    
    return {
      categories: data.categories || [],
      items: data.items || [],
    };
  } catch {
    return null;
  }
};

// Save image to /images/ folder
export const saveImage = async (
  handle: FileSystemDirectoryHandle,
  imageFile: File,
  itemId: string
): Promise<string> => {
  try {
    const imagesHandle = await handle.getDirectoryHandle(IMAGES_FOLDER, { create: true });
    
    const extension = imageFile.name.split('.').pop() || 'jpg';
    const filename = `${itemId}.${extension}`;
    
    const fileHandle = await imagesHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(imageFile);
    await writable.close();
    
    return filename;
  } catch (error) {
    console.error('Failed to save image:', error);
    throw error;
  }
};

// Save image blob to /images/ folder (for import with embedded images)
export const saveImageBlob = async (
  handle: FileSystemDirectoryHandle,
  imageBlob: Blob,
  itemId: string,
  extension: string = 'jpg'
): Promise<string> => {
  try {
    const imagesHandle = await handle.getDirectoryHandle(IMAGES_FOLDER, { create: true });
    
    const filename = `${itemId}.${extension}`;
    
    const fileHandle = await imagesHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(imageBlob);
    await writable.close();
    
    return filename;
  } catch (error) {
    console.error('Failed to save image blob:', error);
    throw error;
  }
};

// Load image from /images/ folder
export const loadImage = async (
  handle: FileSystemDirectoryHandle,
  filename: string
): Promise<string | null> => {
  try {
    const imagesHandle = await handle.getDirectoryHandle(IMAGES_FOLDER);
    const fileHandle = await imagesHandle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
};

// Delete image from /images/ folder
export const deleteImage = async (
  handle: FileSystemDirectoryHandle,
  filename: string
): Promise<void> => {
  try {
    const imagesHandle = await handle.getDirectoryHandle(IMAGES_FOLDER);
    await imagesHandle.removeEntry(filename);
  } catch {
    // Image might not exist
  }
};

// Check if File System Access API is supported
export const isFileSystemAccessSupported = (): boolean => {
  return 'showDirectoryPicker' in window;
};

// Clear saved directory handle
export const clearDirectoryHandle = async (): Promise<void> => {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(HANDLE_STORE_NAME);
      const request = store.delete(HANDLE_KEY);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  } catch {
    // Ignore errors
  }
};

import { useState, useEffect, useCallback } from 'react';
import {
  isFileSystemAccessSupported,
  getDirectoryHandle,
  selectDirectory,
  saveToFileSystem,
  loadFromFileSystem,
  saveImage,
  loadImage,
  clearDirectoryHandle,
} from '@/lib/fileSystemStorage';
import { AppState } from '@/types';

interface UseFileSystemStorageReturn {
  isSupported: boolean;
  isConnected: boolean;
  directoryName: string | null;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  save: (state: AppState) => Promise<void>;
  load: () => Promise<{ categories: AppState['categories']; items: AppState['items'] } | null>;
  saveItemImage: (imageFile: File, itemId: string) => Promise<string>;
  loadItemImage: (filename: string) => Promise<string | null>;
}

export const useFileSystemStorage = (): UseFileSystemStorageReturn => {
  const [isSupported] = useState(() => isFileSystemAccessSupported());
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [directoryName, setDirectoryName] = useState<string | null>(null);

  // Try to restore saved handle on mount
  useEffect(() => {
    if (!isSupported) return;

    const restoreHandle = async () => {
      const savedHandle = await getDirectoryHandle();
      if (savedHandle) {
        setHandle(savedHandle);
        setDirectoryName(savedHandle.name);
      }
    };

    restoreHandle();
  }, [isSupported]);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    const newHandle = await selectDirectory();
    if (newHandle) {
      setHandle(newHandle);
      setDirectoryName(newHandle.name);
      return true;
    }
    return false;
  }, [isSupported]);

  const disconnect = useCallback(async (): Promise<void> => {
    await clearDirectoryHandle();
    setHandle(null);
    setDirectoryName(null);
  }, []);

  const save = useCallback(async (state: AppState): Promise<void> => {
    if (!handle) {
      throw new Error('No directory connected');
    }
    await saveToFileSystem(handle, state);
  }, [handle]);

  const load = useCallback(async () => {
    if (!handle) return null;
    return loadFromFileSystem(handle);
  }, [handle]);

  const saveItemImage = useCallback(async (imageFile: File, itemId: string): Promise<string> => {
    if (!handle) {
      throw new Error('No directory connected');
    }
    return saveImage(handle, imageFile, itemId);
  }, [handle]);

  const loadItemImage = useCallback(async (filename: string): Promise<string | null> => {
    if (!handle) return null;
    return loadImage(handle, filename);
  }, [handle]);

  return {
    isSupported,
    isConnected: handle !== null,
    directoryName,
    connect,
    disconnect,
    save,
    load,
    saveItemImage,
    loadItemImage,
  };
};

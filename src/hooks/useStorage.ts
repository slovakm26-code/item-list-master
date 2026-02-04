/**
 * Unified Storage Hook
 * 
 * Centralizovaný hook pre SQLite-only úložisko.
 * Nahrádza pôvodný useAppState + localStorage kombináciu.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Category, Item, AppState, SortableColumn, CustomFieldFilter } from '@/types';
import { getStorage } from '@/lib/storage';
import { StorageAdapter } from '@/lib/storage/StorageAdapter';
import { runFullMigration, checkLegacyData } from '@/lib/storage/migrations';

// Debounce pre ukladanie
const SAVE_DEBOUNCE_MS = 1000;

// Generovanie ID
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Default kategórie
const defaultCategories: Category[] = [
  { id: 'all', name: 'All Items', parentId: null, orderIndex: 0, icon: 'folder' },
  { id: 'movies', name: 'Movies', parentId: null, orderIndex: 1, icon: 'film' },
  { id: 'series', name: 'Series', parentId: null, orderIndex: 2, icon: 'tv' },
  { id: 'games', name: 'Games', parentId: null, orderIndex: 3, icon: 'gamepad2' },
  { id: 'music', name: 'Music', parentId: null, orderIndex: 4, icon: 'music' },
  { id: 'books', name: 'E-books', parentId: null, orderIndex: 5, icon: 'book-open' },
  { id: 'apps', name: 'Applications', parentId: null, orderIndex: 6, icon: 'package' },
];

const defaultState: AppState = {
  categories: defaultCategories,
  items: [],
  selectedCategoryId: 'all',
  selectedItemIds: [],
  searchQuery: '',
  sortColumn: 'name',
  sortDirection: 'asc',
  useManualOrder: false,
  customFieldFilters: [],
};

interface UseStorageResult {
  // State
  state: AppState;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  
  // Categories
  addCategory: (name: string, parentId?: string | null, icon?: string) => Category;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  moveCategoryUp: (id: string) => void;
  moveCategoryDown: (id: string) => void;
  
  // Items
  addItem: (item: Omit<Item, 'id' | 'orderIndex' | 'addedDate'>) => Item;
  updateItem: (id: string, updates: Partial<Item>) => void;
  deleteItems: (ids: string[]) => void;
  moveItemsToCategory: (itemIds: string[], categoryId: string) => void;
  moveItemUp: (id: string) => void;
  moveItemDown: (id: string) => void;
  
  // Selection
  setSelectedCategory: (id: string | null) => void;
  setSelectedItems: (ids: string[]) => void;
  toggleItemSelection: (id: string, isMultiSelect: boolean) => void;
  
  // Search & Sort
  setSearchQuery: (query: string) => void;
  setSorting: (column: SortableColumn) => void;
  setUseManualOrder: (useManual: boolean) => void;
  setCustomFieldFilters: (filters: CustomFieldFilter[]) => void;
  
  // Computed
  filteredItems: Item[];
  selectedItem: Item | null;
  getCategoryItemCount: (categoryId: string) => number;
  
  // State management
  replaceState: (newState: AppState) => void;
  
  // SQLite export/import
  exportSQLite: () => Promise<void>;
  importSQLite: (file: File) => Promise<void>;
  
  // Storage info
  storageInfo: { type: string; itemCount: number } | null;
}

export const useStorage = (): UseStorageResult => {
  const [state, setState] = useState<AppState>(defaultState);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ type: string; itemCount: number } | null>(null);
  
  const adapterRef = useRef<StorageAdapter | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSaveRef = useRef<AppState | null>(null);

  // ============================================
  // INICIALIZÁCIA
  // ============================================
  
  useEffect(() => {
    const initStorage = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Získaj adapter (auto-detekcia web/electron)
        const adapter = await getStorage();
        adapterRef.current = adapter;

        // Skontroluj či treba migráciu
        const legacy = await checkLegacyData();
        
        if (legacy.hasLocalStorage || legacy.hasIndexedDB) {
          console.log('Detected legacy data, running migration...');
          const result = await runFullMigration(adapter, (msg, prog) => {
            console.log(`Migration: ${msg} (${prog}%)`);
          });
          
          if (!result.success) {
            console.warn('Migration had errors:', result.errors);
          } else {
            console.log(`Migrated ${result.itemsCount} items, ${result.categoriesCount} categories`);
          }
        }

        // Načítaj stav zo SQLite
        const loadedState = await adapter.loadState();
        
        if (loadedState) {
          setState(loadedState);
        } else {
          // Prvé spustenie - ulož default stav
          await adapter.saveState(defaultState);
        }

        // Získaj info o storage
        const info = await adapter.getStorageInfo();
        setStorageInfo({ type: info.type, itemCount: info.itemCount });

        setIsReady(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize storage';
        setError(message);
        console.error('Storage init error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initStorage();

    return () => {
      // Cleanup - ulož pending zmeny
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (pendingSaveRef.current && adapterRef.current) {
        adapterRef.current.saveState(pendingSaveRef.current);
      }
    };
  }, []);

  // ============================================
  // DEBOUNCED SAVE
  // ============================================
  
  const debouncedSave = useCallback((newState: AppState) => {
    pendingSaveRef.current = newState;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (adapterRef.current && pendingSaveRef.current) {
        try {
          await adapterRef.current.saveState(pendingSaveRef.current);
          pendingSaveRef.current = null;
        } catch (err) {
          console.error('Failed to save state:', err);
        }
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // Save on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (pendingSaveRef.current && adapterRef.current) {
        // Synchrónne uloženie nie je možné, ale pokúsime sa
        adapterRef.current.saveState(pendingSaveRef.current);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ============================================
  // STATE UPDATE HELPER
  // ============================================
  
  const updateState = useCallback((updater: (prev: AppState) => AppState) => {
    setState(prev => {
      const newState = updater(prev);
      debouncedSave(newState);
      return newState;
    });
  }, [debouncedSave]);

  // ============================================
  // CATEGORY OPERATIONS
  // ============================================
  
  const addCategory = useCallback((
    name: string, 
    parentId: string | null = null, 
    icon: string = 'folder'
  ): Category => {
    const newCategory: Category = {
      id: generateId(),
      name,
      parentId,
      orderIndex: state.categories.filter(c => c.parentId === parentId).length,
      icon,
    };

    updateState(prev => ({
      ...prev,
      categories: [...prev.categories, newCategory],
    }));

    return newCategory;
  }, [state.categories, updateState]);

  const updateCategory = useCallback((id: string, updates: Partial<Category>) => {
    updateState(prev => ({
      ...prev,
      categories: prev.categories.map(c => 
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  }, [updateState]);

  const deleteCategory = useCallback((id: string) => {
    const getDescendants = (categoryId: string): string[] => {
      const children = state.categories.filter(c => c.parentId === categoryId);
      return [categoryId, ...children.flatMap(c => getDescendants(c.id))];
    };

    const toDelete = getDescendants(id);

    updateState(prev => ({
      ...prev,
      categories: prev.categories.filter(c => !toDelete.includes(c.id)),
      items: prev.items.filter(i => !toDelete.includes(i.categoryId)),
      selectedCategoryId: toDelete.includes(prev.selectedCategoryId || '') 
        ? 'all' 
        : prev.selectedCategoryId,
    }));
  }, [state.categories, updateState]);

  const moveCategoryUp = useCallback((id: string) => {
    updateState(prev => {
      const category = prev.categories.find(c => c.id === id);
      if (!category) return prev;

      const siblings = prev.categories
        .filter(c => c.parentId === category.parentId)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      const currentIndex = siblings.findIndex(c => c.id === id);
      if (currentIndex <= 0) return prev;

      const prevSibling = siblings[currentIndex - 1];

      return {
        ...prev,
        categories: prev.categories.map(c => {
          if (c.id === id) return { ...c, orderIndex: prevSibling.orderIndex };
          if (c.id === prevSibling.id) return { ...c, orderIndex: category.orderIndex };
          return c;
        }),
      };
    });
  }, [updateState]);

  const moveCategoryDown = useCallback((id: string) => {
    updateState(prev => {
      const category = prev.categories.find(c => c.id === id);
      if (!category) return prev;

      const siblings = prev.categories
        .filter(c => c.parentId === category.parentId)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      const currentIndex = siblings.findIndex(c => c.id === id);
      if (currentIndex >= siblings.length - 1) return prev;

      const nextSibling = siblings[currentIndex + 1];

      return {
        ...prev,
        categories: prev.categories.map(c => {
          if (c.id === id) return { ...c, orderIndex: nextSibling.orderIndex };
          if (c.id === nextSibling.id) return { ...c, orderIndex: category.orderIndex };
          return c;
        }),
      };
    });
  }, [updateState]);

  // ============================================
  // ITEM OPERATIONS
  // ============================================
  
  const addItem = useCallback((item: Omit<Item, 'id' | 'orderIndex' | 'addedDate'>): Item => {
    const categoryItems = state.items.filter(i => i.categoryId === item.categoryId);
    const maxOrder = Math.max(-1, ...categoryItems.map(i => i.orderIndex));

    const newItem: Item = {
      ...item,
      id: generateId(),
      orderIndex: maxOrder + 1,
      addedDate: new Date().toISOString(),
    };

    updateState(prev => ({
      ...prev,
      items: [...prev.items, newItem],
    }));

    return newItem;
  }, [state.items, updateState]);

  const updateItem = useCallback((id: string, updates: Partial<Item>) => {
    updateState(prev => ({
      ...prev,
      items: prev.items.map(i => 
        i.id === id ? { ...i, ...updates } : i
      ),
    }));
  }, [updateState]);

  const deleteItems = useCallback((ids: string[]) => {
    updateState(prev => ({
      ...prev,
      items: prev.items.filter(i => !ids.includes(i.id)),
      selectedItemIds: prev.selectedItemIds.filter(id => !ids.includes(id)),
    }));
  }, [updateState]);

  const moveItemsToCategory = useCallback((itemIds: string[], categoryId: string) => {
    updateState(prev => {
      const categoryItems = prev.items.filter(i => i.categoryId === categoryId);
      let maxOrder = Math.max(-1, ...categoryItems.map(i => i.orderIndex));

      return {
        ...prev,
        items: prev.items.map(i => {
          if (itemIds.includes(i.id)) {
            maxOrder++;
            return { ...i, categoryId, orderIndex: maxOrder };
          }
          return i;
        }),
      };
    });
  }, [updateState]);

  const moveItemUp = useCallback((id: string) => {
    updateState(prev => {
      const item = prev.items.find(i => i.id === id);
      if (!item) return prev;

      const categoryItems = prev.items
        .filter(i => i.categoryId === item.categoryId)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      const currentIndex = categoryItems.findIndex(i => i.id === id);
      if (currentIndex <= 0) return prev;

      const prevItem = categoryItems[currentIndex - 1];

      return {
        ...prev,
        items: prev.items.map(i => {
          if (i.id === id) return { ...i, orderIndex: prevItem.orderIndex };
          if (i.id === prevItem.id) return { ...i, orderIndex: item.orderIndex };
          return i;
        }),
      };
    });
  }, [updateState]);

  const moveItemDown = useCallback((id: string) => {
    updateState(prev => {
      const item = prev.items.find(i => i.id === id);
      if (!item) return prev;

      const categoryItems = prev.items
        .filter(i => i.categoryId === item.categoryId)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      const currentIndex = categoryItems.findIndex(i => i.id === id);
      if (currentIndex >= categoryItems.length - 1) return prev;

      const nextItem = categoryItems[currentIndex + 1];

      return {
        ...prev,
        items: prev.items.map(i => {
          if (i.id === id) return { ...i, orderIndex: nextItem.orderIndex };
          if (i.id === nextItem.id) return { ...i, orderIndex: item.orderIndex };
          return i;
        }),
      };
    });
  }, [updateState]);

  // ============================================
  // SELECTION
  // ============================================
  
  const setSelectedCategory = useCallback((categoryId: string | null) => {
    setState(prev => ({
      ...prev,
      selectedCategoryId: categoryId,
      selectedItemIds: [],
    }));
    // Neukladáme UI stav do SQLite (len dáta)
  }, []);

  const setSelectedItems = useCallback((itemIds: string[]) => {
    setState(prev => ({ ...prev, selectedItemIds: itemIds }));
  }, []);

  const toggleItemSelection = useCallback((itemId: string, isMultiSelect: boolean) => {
    setState(prev => {
      if (isMultiSelect) {
        const isSelected = prev.selectedItemIds.includes(itemId);
        return {
          ...prev,
          selectedItemIds: isSelected
            ? prev.selectedItemIds.filter(id => id !== itemId)
            : [...prev.selectedItemIds, itemId],
        };
      }
      return { ...prev, selectedItemIds: [itemId] };
    });
  }, []);

  // ============================================
  // SEARCH & SORT
  // ============================================
  
  const setSearchQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const setSorting = useCallback((column: SortableColumn) => {
    setState(prev => ({
      ...prev,
      sortColumn: column,
      sortDirection: prev.sortColumn === column && prev.sortDirection === 'asc' ? 'desc' : 'asc',
      useManualOrder: false,
    }));
  }, []);

  const setUseManualOrder = useCallback((useManual: boolean) => {
    setState(prev => ({
      ...prev,
      useManualOrder: useManual,
      sortColumn: useManual ? null : prev.sortColumn,
    }));
  }, []);

  const setCustomFieldFilters = useCallback((filters: CustomFieldFilter[]) => {
    setState(prev => ({ ...prev, customFieldFilters: filters }));
  }, []);

  // ============================================
  // COMPUTED VALUES
  // ============================================
  
  const filteredItems = useMemo(() => {
    let items = state.items;

    // Filter by category
    if (state.selectedCategoryId && state.selectedCategoryId !== 'all') {
      const getDescendantIds = (categoryId: string): string[] => {
        const children = state.categories.filter(c => c.parentId === categoryId);
        return [categoryId, ...children.flatMap(c => getDescendantIds(c.id))];
      };
      const categoryIds = getDescendantIds(state.selectedCategoryId);
      items = items.filter(i => categoryIds.includes(i.categoryId));
    }

    // Filter by search
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      items = items.filter(i =>
        i.name.toLowerCase().includes(query) ||
        i.genres.some(g => g.toLowerCase().includes(query)) ||
        i.path.toLowerCase().includes(query) ||
        i.description.toLowerCase().includes(query)
      );
    }

    // Filter by custom fields
    if (state.customFieldFilters?.length > 0) {
      items = items.filter(item => {
        return state.customFieldFilters.every(filter => {
          if (item.categoryId !== filter.categoryId) return true;
          
          const fieldValue = item.customFieldValues?.[filter.fieldId];
          if (fieldValue === undefined) return false;

          if (filter.operator === 'contains' && typeof fieldValue === 'string') {
            return fieldValue.toLowerCase().includes(String(filter.value).toLowerCase());
          }

          return fieldValue === filter.value;
        });
      });
    }

    // Sort
    if (state.useManualOrder) {
      items = [...items].sort((a, b) => a.orderIndex - b.orderIndex);
    } else if (state.sortColumn) {
      items = [...items].sort((a, b) => {
        let aVal = a[state.sortColumn!];
        let bVal = b[state.sortColumn!];

        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();

        if (aVal < bVal) return state.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return state.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return items;
  }, [state.items, state.categories, state.selectedCategoryId, state.searchQuery, 
      state.sortColumn, state.sortDirection, state.useManualOrder, state.customFieldFilters]);

  const selectedItem = useMemo(() => {
    if (state.selectedItemIds.length !== 1) return null;
    return state.items.find(i => i.id === state.selectedItemIds[0]) || null;
  }, [state.items, state.selectedItemIds]);

  const getCategoryItemCount = useCallback((categoryId: string): number => {
    if (categoryId === 'all') return state.items.length;

    const getDescendantIds = (catId: string): string[] => {
      const children = state.categories.filter(c => c.parentId === catId);
      return [catId, ...children.flatMap(c => getDescendantIds(c.id))];
    };
    const categoryIds = getDescendantIds(categoryId);
    return state.items.filter(i => categoryIds.includes(i.categoryId)).length;
  }, [state.items, state.categories]);

  // ============================================
  // STATE REPLACEMENT (for import)
  // ============================================
  
  const replaceState = useCallback((newState: AppState) => {
    setState(newState);
    if (adapterRef.current) {
      adapterRef.current.saveState(newState);
    }
  }, []);

  // ============================================
  // SQLITE EXPORT/IMPORT
  // ============================================
  
  const exportSQLite = useCallback(async () => {
    if (!adapterRef.current) {
      throw new Error('Storage not initialized');
    }
    
    const data = adapterRef.current.exportDatabase();
    if (!data) {
      throw new Error('Export not available for this storage type');
    }
    
    // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    
    const blob = new Blob([buffer], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `stuff_organizer_${timestamp}.db`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const importSQLite = useCallback(async (file: File) => {
    if (!adapterRef.current) {
      throw new Error('Storage not initialized');
    }
    
    // Cancel any pending saves to prevent overwriting imported data
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = null;
    
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    await adapterRef.current.importDatabase(data);
    
    // Reload state from imported database
    const loadedState = await adapterRef.current.loadState();
    if (loadedState) {
      // Use setState directly without triggering a save
      setState(loadedState);
    }
    
    // Update storage info
    const info = await adapterRef.current.getStorageInfo();
    setStorageInfo({ type: info.type, itemCount: info.itemCount });
    
    console.log(`SQLite imported successfully: ${info.itemCount} items`);
  }, []);

  return {
    state,
    isLoading,
    isReady,
    error,
    
    addCategory,
    updateCategory,
    deleteCategory,
    moveCategoryUp,
    moveCategoryDown,
    
    addItem,
    updateItem,
    deleteItems,
    moveItemsToCategory,
    moveItemUp,
    moveItemDown,
    
    setSelectedCategory,
    setSelectedItems,
    toggleItemSelection,
    
    setSearchQuery,
    setSorting,
    setUseManualOrder,
    setCustomFieldFilters,
    
    filteredItems,
    selectedItem,
    getCategoryItemCount,
    
    replaceState,
    exportSQLite,
    importSQLite,
    storageInfo,
  };
};

// Re-export pre spätná kompatibilitu
export const useAppState = useStorage;

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Category, Item, AppState, SortableColumn, CustomFieldFilter } from '@/types';
import { initDatabase, saveDatabase, generateId } from '@/lib/database';

// Debounced save to prevent excessive writes
const SAVE_DELAY = 2000;

export const useAppState = () => {
  const [state, setState] = useState<AppState>(() => initDatabase());
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  // Debounced persist to localStorage
  useEffect(() => {
    // Skip initial mount to avoid unnecessary save
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule new save
    saveTimeoutRef.current = setTimeout(() => {
      saveDatabase(state);
    }, SAVE_DELAY);

    // Cleanup on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state]);

  // Save immediately on beforeunload to prevent data loss
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveDatabase(state);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state]);

  // Categories operations
  const addCategory = useCallback((name: string, parentId: string | null = null, icon: string = 'folder') => {
    const siblings = state.categories.filter(c => c.parentId === parentId);
    const maxOrder = Math.max(-1, ...siblings.map(c => c.orderIndex));
    
    const newCategory: Category = {
      id: generateId(),
      name,
      parentId,
      orderIndex: maxOrder + 1,
      icon,
    };
    
    setState(prev => ({
      ...prev,
      categories: [...prev.categories, newCategory],
    }));
    
    return newCategory;
  }, [state.categories]);

  const updateCategory = useCallback((id: string, updates: Partial<Category>) => {
    setState(prev => ({
      ...prev,
      categories: prev.categories.map(c => 
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  }, []);

  const deleteCategory = useCallback((id: string) => {
    // Get all descendant categories
    const getDescendants = (categoryId: string): string[] => {
      const children = state.categories.filter(c => c.parentId === categoryId);
      return [categoryId, ...children.flatMap(c => getDescendants(c.id))];
    };
    
    const toDelete = getDescendants(id);
    
    setState(prev => ({
      ...prev,
      categories: prev.categories.filter(c => !toDelete.includes(c.id)),
      items: prev.items.filter(i => !toDelete.includes(i.categoryId)),
      selectedCategoryId: toDelete.includes(prev.selectedCategoryId || '') 
        ? 'all' 
        : prev.selectedCategoryId,
    }));
  }, [state.categories]);

  const moveCategoryUp = useCallback((id: string) => {
    setState(prev => {
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
  }, []);

  const moveCategoryDown = useCallback((id: string) => {
    setState(prev => {
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
  }, []);

  // Items operations
  const addItem = useCallback((item: Omit<Item, 'id' | 'orderIndex' | 'addedDate'>) => {
    const categoryItems = state.items.filter(i => i.categoryId === item.categoryId);
    const maxOrder = Math.max(-1, ...categoryItems.map(i => i.orderIndex));
    
    const newItem: Item = {
      ...item,
      id: generateId(),
      orderIndex: maxOrder + 1,
      addedDate: new Date().toISOString(),
    };
    
    setState(prev => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    
    return newItem;
  }, [state.items]);

  const updateItem = useCallback((id: string, updates: Partial<Item>) => {
    setState(prev => ({
      ...prev,
      items: prev.items.map(i => 
        i.id === id ? { ...i, ...updates } : i
      ),
    }));
  }, []);

  const deleteItems = useCallback((ids: string[]) => {
    setState(prev => ({
      ...prev,
      items: prev.items.filter(i => !ids.includes(i.id)),
      selectedItemIds: prev.selectedItemIds.filter(id => !ids.includes(id)),
    }));
  }, []);

  const moveItemsToCategory = useCallback((itemIds: string[], categoryId: string) => {
    const categoryItems = state.items.filter(i => i.categoryId === categoryId);
    let maxOrder = Math.max(-1, ...categoryItems.map(i => i.orderIndex));
    
    setState(prev => ({
      ...prev,
      items: prev.items.map(i => {
        if (itemIds.includes(i.id)) {
          maxOrder++;
          return { ...i, categoryId, orderIndex: maxOrder };
        }
        return i;
      }),
    }));
  }, [state.items]);

  const moveItemUp = useCallback((id: string) => {
    setState(prev => {
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
  }, []);

  const moveItemDown = useCallback((id: string) => {
    setState(prev => {
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
  }, []);

  // Selection operations
  const setSelectedCategory = useCallback((categoryId: string | null) => {
    setState(prev => ({
      ...prev,
      selectedCategoryId: categoryId,
      selectedItemIds: [],
    }));
  }, []);

  const setSelectedItems = useCallback((itemIds: string[]) => {
    setState(prev => ({
      ...prev,
      selectedItemIds: itemIds,
    }));
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
      return {
        ...prev,
        selectedItemIds: [itemId],
      };
    });
  }, []);

  // Search and sort
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

  // Computed values
  const filteredItems = useMemo(() => {
    let items = state.items;
    
    // Filter by category
    if (state.selectedCategoryId && state.selectedCategoryId !== 'all') {
      // Include items from subcategories
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
        i.path.toLowerCase().includes(query)
      );
    }

    // Filter by custom fields
    if (state.customFieldFilters && state.customFieldFilters.length > 0) {
      items = items.filter(item => {
        return state.customFieldFilters.every(filter => {
          // Only apply filter if item is in the filter's category
          if (item.categoryId !== filter.categoryId) {
            return true; // Don't filter out items from other categories
          }
          
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
  }, [state.items, state.categories, state.selectedCategoryId, state.searchQuery, state.sortColumn, state.sortDirection, state.useManualOrder]);

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

  // Full state replacement for import
  const replaceState = useCallback((newState: AppState) => {
    setState(newState);
  }, []);

  return {
    state,
    replaceState,
    // Categories
    addCategory,
    updateCategory,
    deleteCategory,
    moveCategoryUp,
    moveCategoryDown,
    // Items
    addItem,
    updateItem,
    deleteItems,
    moveItemsToCategory,
    moveItemUp,
    moveItemDown,
    // Selection
    setSelectedCategory,
    setSelectedItems,
    toggleItemSelection,
    // Search and sort
    setSearchQuery,
    setSorting,
    setUseManualOrder,
    setCustomFieldFilters,
    // Computed
    filteredItems,
    selectedItem,
    getCategoryItemCount,
  };
};

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useStorage } from '@/hooks/useStorage';
import { useUIPreferences } from '@/hooks/useUIPreferences';
import { Toolbar } from '@/components/Toolbar';
import { CategoryTree } from '@/components/CategoryTree';
import { VirtualizedList } from '@/components/VirtualizedList';
import { DetailPanel } from '@/components/DetailPanel';
import { ItemDialog } from '@/components/ItemDialog';
import { BackupDialog } from '@/components/BackupDialog';
import { Item, SortableColumn, CustomFieldFilter as CustomFieldFilterType } from '@/types';
import { downloadExportWithImages, importDatabaseWithImages } from '@/lib/exportWithImages';
import { toast } from 'sonner';
import { Loader2, AlertCircle, Database } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export const StuffOrganizer = () => {
  const {
    state,
    replaceState,
    isLoading,
    isReady,
    error,
    storageInfo,
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
  } = useStorage();

  const {
    preferences,
    setColumnWidth,
    getColumnWidth,
    setDetailPanelHeight,
    toggleDetailPanel,
  } = useUIPreferences();

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || 
                             target.tagName === 'TEXTAREA' || 
                             target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
        searchInput?.focus();
        searchInput?.select();
        return;
      }

      if (isInputFocused) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setEditingItem(null);
        setItemDialogOpen(true);
        return;
      }

      if (e.key === 'Delete' && state.selectedItemIds.length > 0) {
        e.preventDefault();
        deleteItems(state.selectedItemIds);
        toast.success(`${state.selectedItemIds.length} item(s) deleted`);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedItems([]);
        return;
      }

      if (e.key === 'Enter' && state.selectedItemIds.length === 1) {
        e.preventDefault();
        const item = filteredItems.find(i => i.id === state.selectedItemIds[0]);
        if (item) {
          setEditingItem(item);
          setItemDialogOpen(true);
        }
        return;
      }

      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && filteredItems.length > 0) {
        e.preventDefault();
        
        if (state.selectedItemIds.length === 0) {
          setSelectedItems([filteredItems[0].id]);
        } else {
          const currentIndex = filteredItems.findIndex(
            i => i.id === state.selectedItemIds[state.selectedItemIds.length - 1]
          );
          
          let newIndex: number;
          if (e.key === 'ArrowDown') {
            newIndex = Math.min(currentIndex + 1, filteredItems.length - 1);
          } else {
            newIndex = Math.max(currentIndex - 1, 0);
          }

          if (e.shiftKey) {
            const newId = filteredItems[newIndex].id;
            if (!state.selectedItemIds.includes(newId)) {
              setSelectedItems([...state.selectedItemIds, newId]);
            }
          } else {
            setSelectedItems([filteredItems[newIndex].id]);
          }
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedItems(filteredItems.map(i => i.id));
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedItemIds, filteredItems, deleteItems, setSelectedItems]);

  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = {};
    preferences.columnWidths.forEach(c => {
      widths[c.key] = c.width;
    });
    return widths;
  }, [preferences.columnWidths]);

  const handleAddItem = () => {
    setEditingItem(null);
    setItemDialogOpen(true);
  };

  const handleEditItem = (item: Item) => {
    setEditingItem(item);
    setItemDialogOpen(true);
  };

  const handleSaveItem = (item: Omit<Item, 'id' | 'orderIndex' | 'addedDate'>) => {
    addItem(item);
    toast.success('Item added successfully');
  };

  const handleUpdateItem = (id: string, updates: Partial<Item>) => {
    updateItem(id, updates);
    toast.success('Item updated successfully');
  };

  const handleDeleteItems = (ids: string[]) => {
    deleteItems(ids);
    toast.success(`${ids.length} item(s) deleted`);
  };

  const handleExport = async () => {
    try {
      await downloadExportWithImages(state);
      toast.success('Database exported');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export database');
    }
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const data = await importDatabaseWithImages(file);
        
        replaceState({
          ...state,
          categories: data.categories,
          items: data.items,
        });
        
        toast.success(`Imported ${data.items.length} items`);
      } catch (error) {
        console.error('Import failed:', error);
        toast.error('Failed to import database. Invalid file format.');
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleBackup = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupKey = `stuff_organizer_backup_${timestamp}`;
    localStorage.setItem(backupKey, JSON.stringify(state));
    toast.success('Backup created successfully');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">Načítavam databázu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen p-8 bg-background">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Chyba pri načítaní</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-4">{error}</p>
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()}
            >
              Skúsiť znova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Inicializujem...</p>
      </div>
    );
  }

  return (
    <div className="app-container flex flex-col h-screen">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileSelected}
      />

      <Toolbar
        searchQuery={state.searchQuery}
        onSearchChange={setSearchQuery}
        onAddItem={handleAddItem}
        onExport={handleExport}
        onImport={handleImport}
        onBackup={handleBackup}
        onManageBackups={() => setBackupDialogOpen(true)}
        onOpenDataFolder={window.electronApp?.openDataFolder}
        isElectron={!!window.electronApp?.isElectron}
        categories={state.categories}
        customFieldFilters={state.customFieldFilters || []}
        onCustomFieldFiltersChange={setCustomFieldFilters}
      />

      <div className="app-main flex-1 overflow-hidden">
        <div className="app-top-section">
          <CategoryTree
            categories={state.categories}
            selectedCategoryId={state.selectedCategoryId}
            onSelectCategory={setSelectedCategory}
            onAddCategory={addCategory}
            onUpdateCategory={updateCategory}
            onDeleteCategory={deleteCategory}
            onMoveUp={moveCategoryUp}
            onMoveDown={moveCategoryDown}
            getCategoryItemCount={getCategoryItemCount}
          />

          <div className="app-content">
            <VirtualizedList
              items={filteredItems}
              categories={state.categories}
              selectedItemIds={state.selectedItemIds}
              sortColumn={state.sortColumn as SortableColumn | null}
              sortDirection={state.sortDirection}
              useManualOrder={state.useManualOrder}
              columnWidths={columnWidths}
              onColumnResize={setColumnWidth}
              onSelectItem={toggleItemSelection}
              onSetSelectedItems={setSelectedItems}
              onSort={setSorting}
              onSetManualOrder={setUseManualOrder}
              onEditItem={handleEditItem}
              onDeleteItems={handleDeleteItems}
              onMoveItemsToCategory={moveItemsToCategory}
              onMoveItemUp={moveItemUp}
              onMoveItemDown={moveItemDown}
            />
          </div>
        </div>

        <DetailPanel
          item={selectedItem}
          categories={state.categories}
          onUpdateItem={handleUpdateItem}
          selectedCount={state.selectedItemIds.length}
          height={preferences.detailPanelHeight}
          visible={preferences.detailPanelVisible}
          onHeightChange={setDetailPanelHeight}
          onToggleVisible={toggleDetailPanel}
        />
      </div>

      {storageInfo && (
        <footer className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Database className="h-3 w-3" />
            <span>JSON ({storageInfo.type})</span>
          </div>
          <div>
            <span className="font-medium">{storageInfo.itemCount.toLocaleString()}</span> položiek v databáze
          </div>
        </footer>
      )}

      <ItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
        categories={state.categories}
        defaultCategoryId={state.selectedCategoryId}
        onSave={handleSaveItem}
        onUpdate={handleUpdateItem}
      />

      <BackupDialog
        open={backupDialogOpen}
        onOpenChange={setBackupDialogOpen}
        onRestore={replaceState}
      />
    </div>
  );
};

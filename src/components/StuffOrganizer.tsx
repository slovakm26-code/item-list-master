import { useState, useRef, useMemo, useEffect } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useUIPreferences } from '@/hooks/useUIPreferences';
import { useFileSystemStorage } from '@/hooks/useFileSystemStorage';
import { Toolbar } from '@/components/Toolbar';
import { CategoryTree } from '@/components/CategoryTree';
import { VirtualizedList } from '@/components/VirtualizedList';
import { DetailPanel } from '@/components/DetailPanel';
import { ItemDialog } from '@/components/ItemDialog';
import { BackupDialog } from '@/components/BackupDialog';
import { StorageConnectionDialog } from '@/components/StorageConnectionDialog';
import { SQLiteImportDialog } from '@/components/SQLiteImportDialog';
import { Item, SortableColumn } from '@/types';
import { createBackup } from '@/lib/database';
import { downloadExportWithImages, importDatabaseWithImages } from '@/lib/exportWithImages';
import { toast } from 'sonner';

export const StuffOrganizer = () => {
  const {
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
    // Computed
    filteredItems,
    selectedItem,
    getCategoryItemCount,
  } = useAppState();

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
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  const [sqliteImportDialogOpen, setSqliteImportDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File system storage hook
  const fileSystemStorage = useFileSystemStorage();

  // Auto-save to file system when connected
  useEffect(() => {
    if (fileSystemStorage.isConnected) {
      fileSystemStorage.save(state).catch(console.error);
    }
  }, [state.items, state.categories, fileSystemStorage.isConnected]);

  // Convert column widths to object format
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
      // Export with embedded images if storage is connected
      await downloadExportWithImages(
        state,
        fileSystemStorage.isConnected ? fileSystemStorage.loadItemImage : undefined
      );
      toast.success('Database exported with images');
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
        // Import with image restoration if storage is connected
        const data = await importDatabaseWithImages(
          file,
          fileSystemStorage.isConnected 
            ? async (blob, itemId, ext) => fileSystemStorage.saveItemImageBlob(blob, itemId, ext)
            : undefined
        );
        
        replaceState({
          ...state,
          categories: data.categories,
          items: data.items,
        });
        
        toast.success(`Imported ${data.items.length} items` + 
          (fileSystemStorage.isConnected ? ' with images' : ''));
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
    createBackup();
    toast.success('Backup created successfully');
  };

  return (
    <div className="app-container">
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
        onOpenStorage={() => setStorageDialogOpen(true)}
        onOpenSQLiteImport={() => setSqliteImportDialogOpen(true)}
        isStorageConnected={fileSystemStorage.isConnected}
      />

      <div className="app-main">
        {/* Top section: Sidebar + Table */}
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

        {/* Bottom section: Detail panel */}
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

      <StorageConnectionDialog
        open={storageDialogOpen}
        onOpenChange={setStorageDialogOpen}
        isSupported={fileSystemStorage.isSupported}
        isConnected={fileSystemStorage.isConnected}
        directoryName={fileSystemStorage.directoryName}
        onConnect={fileSystemStorage.connect}
        onDisconnect={fileSystemStorage.disconnect}
      />

      <SQLiteImportDialog
        open={sqliteImportDialogOpen}
        onOpenChange={setSqliteImportDialogOpen}
        categories={state.categories}
        onImport={(items) => {
          items.forEach(item => {
            addItem({
              name: item.name,
              year: item.year,
              rating: item.rating,
              genres: item.genres,
              description: item.description,
              categoryId: item.categoryId,
              path: item.path,
              coverPath: item.coverPath,
            });
          });
        }}
      />
    </div>
  );
};

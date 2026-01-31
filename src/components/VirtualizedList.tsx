import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { 
  ArrowUp, 
  ArrowDown, 
  ArrowUpDown,
  MoreVertical,
  Pencil,
  Trash2,
  FolderInput,
  GripVertical,
} from 'lucide-react';
import { Item, Category, SortableColumn } from '@/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Column {
  key: SortableColumn | 'genres';
  label: string;
  width: number;
  minWidth: number;
  sortable: boolean;
}

const defaultColumns: Column[] = [
  { key: 'name', label: 'Name', width: 300, minWidth: 150, sortable: true },
  { key: 'year', label: 'Year', width: 80, minWidth: 60, sortable: true },
  { key: 'rating', label: 'Rating', width: 80, minWidth: 60, sortable: true },
  { key: 'genres', label: 'Genres', width: 200, minWidth: 100, sortable: false },
  { key: 'addedDate', label: 'Added', width: 150, minWidth: 100, sortable: true },
  { key: 'path', label: 'Path', width: 300, minWidth: 150, sortable: true },
];

interface VirtualizedListProps {
  items: Item[];
  categories: Category[];
  selectedItemIds: string[];
  sortColumn: SortableColumn | null;
  sortDirection: 'asc' | 'desc';
  useManualOrder: boolean;
  onSelectItem: (itemId: string, isMultiSelect: boolean) => void;
  onSetSelectedItems: (itemIds: string[]) => void;
  onSort: (column: SortableColumn) => void;
  onSetManualOrder: (useManual: boolean) => void;
  onEditItem: (item: Item) => void;
  onDeleteItems: (itemIds: string[]) => void;
  onMoveItemsToCategory: (itemIds: string[], categoryId: string) => void;
  onMoveItemUp: (itemId: string) => void;
  onMoveItemDown: (itemId: string) => void;
}

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 36;
const OVERSCAN = 5;

export const VirtualizedList = ({
  items,
  categories,
  selectedItemIds,
  sortColumn,
  sortDirection,
  useManualOrder,
  onSelectItem,
  onSetSelectedItems,
  onSort,
  onSetManualOrder,
  onEditItem,
  onDeleteItems,
  onMoveItemsToCategory,
  onMoveItemUp,
  onMoveItemDown,
}: VirtualizedListProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [columns, setColumns] = useState<Column[]>(defaultColumns);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);

  // Update container height on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height - HEADER_HEIGHT);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Calculate visible range
  const { startIndex, endIndex, visibleItems, totalHeight } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const end = Math.min(items.length, start + visibleCount);

    return {
      startIndex: start,
      endIndex: end,
      visibleItems: items.slice(start, end),
      totalHeight: items.length * ROW_HEIGHT,
    };
  }, [scrollTop, containerHeight, items]);

  // Column resizing
  const handleResizeStart = (columnKey: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setResizingColumn(columnKey);

    const startX = e.clientX;
    const column = columns.find(c => c.key === columnKey);
    const startWidth = column?.width || 100;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      setColumns(prev => prev.map(c => 
        c.key === columnKey 
          ? { ...c, width: Math.max(c.minWidth, startWidth + diff) }
          : c
      ));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Selection handling
  const handleRowClick = (item: Item, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      onSelectItem(item.id, true);
    } else if (e.shiftKey && selectedItemIds.length > 0) {
      const lastSelectedIndex = items.findIndex(i => i.id === selectedItemIds[selectedItemIds.length - 1]);
      const currentIndex = items.findIndex(i => i.id === item.id);
      const [start, end] = [Math.min(lastSelectedIndex, currentIndex), Math.max(lastSelectedIndex, currentIndex)];
      const rangeIds = items.slice(start, end + 1).map(i => i.id);
      onSetSelectedItems([...new Set([...selectedItemIds, ...rangeIds])]);
    } else {
      onSelectItem(item.id, false);
    }
  };

  // Context menu
  const handleContextMenu = (item: Item, e: React.MouseEvent) => {
    e.preventDefault();
    if (!selectedItemIds.includes(item.id)) {
      onSelectItem(item.id, false);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, itemId: item.id });
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Drag and drop handlers for manual reordering
  const handleDragStart = (itemId: string) => (e: React.DragEvent) => {
    if (!useManualOrder) return;
    setDraggedItemId(itemId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
  };

  const handleDragOver = (itemId: string) => (e: React.DragEvent) => {
    if (!useManualOrder || !draggedItemId || draggedItemId === itemId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverItemId(itemId);
  };

  const handleDragLeave = () => {
    setDragOverItemId(null);
  };

  const handleDrop = (targetItemId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!useManualOrder || !draggedItemId || draggedItemId === targetItemId) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      return;
    }

    // Find indices
    const draggedIndex = items.findIndex(i => i.id === draggedItemId);
    const targetIndex = items.findIndex(i => i.id === targetItemId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      return;
    }

    // Move the item up or down based on position
    if (draggedIndex < targetIndex) {
      // Moving down - call moveDown multiple times
      for (let i = draggedIndex; i < targetIndex; i++) {
        onMoveItemDown(draggedItemId);
      }
    } else {
      // Moving up - call moveUp multiple times
      for (let i = draggedIndex; i > targetIndex; i--) {
        onMoveItemUp(draggedItemId);
      }
    }

    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('sk-SK', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get cell value
  const getCellValue = (item: Item, columnKey: string): string => {
    switch (columnKey) {
      case 'genres':
        return item.genres.join(', ');
      case 'addedDate':
        return formatDate(item.addedDate);
      case 'rating':
        return item.rating?.toFixed(1) || '-';
      case 'year':
        return item.year?.toString() || '-';
      case 'name':
        return item.name;
      case 'path':
        return item.path;
      default:
        return '';
    }
  };

  // Render sort indicator
  const renderSortIndicator = (columnKey: string) => {
    if (!columns.find(c => c.key === columnKey)?.sortable) return null;
    
    if (sortColumn === columnKey) {
      return sortDirection === 'asc' 
        ? <ArrowUp className="w-3.5 h-3.5" />
        : <ArrowDown className="w-3.5 h-3.5" />;
    }
    return <ArrowUpDown className="w-3.5 h-3.5 opacity-30" />;
  };

  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0) + (useManualOrder ? 40 : 0);
  const movableCategories = categories.filter(c => c.id !== 'all');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Order mode toggle */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
        <span className="text-xs text-muted-foreground">Order:</span>
        <Button
          variant={!useManualOrder ? "secondary" : "ghost"}
          size="sm"
          className="h-6 text-xs"
          onClick={() => onSetManualOrder(false)}
        >
          Automatic
        </Button>
        <Button
          variant={useManualOrder ? "secondary" : "ghost"}
          size="sm"
          className="h-6 text-xs"
          onClick={() => onSetManualOrder(true)}
        >
          Manual
        </Button>
        {useManualOrder && selectedItemIds.length === 1 && (
          <>
            <div className="w-px h-4 bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => onMoveItemUp(selectedItemIds[0])}
            >
              <ArrowUp className="w-3 h-3" /> Up
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => onMoveItemDown(selectedItemIds[0])}
            >
              <ArrowDown className="w-3 h-3" /> Down
            </Button>
          </>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {items.length} items {selectedItemIds.length > 0 && `(${selectedItemIds.length} selected)`}
        </span>
      </div>

      {/* List container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        <div style={{ minWidth: totalWidth }}>
          {/* Header */}
          <div 
            className="list-header sticky top-0 z-10"
            style={{ width: totalWidth }}
          >
            {useManualOrder && (
              <div className="w-10 shrink-0 flex items-center justify-center">
                <GripVertical className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            {columns.map((column) => (
              <div
                key={column.key}
                className="flex items-center relative shrink-0"
                style={{ width: column.width }}
              >
                <button
                  className={cn(
                    "flex items-center gap-1 px-2 h-full text-left flex-1",
                    column.sortable && "hover:bg-muted/50 cursor-pointer"
                  )}
                  onClick={() => column.sortable && onSort(column.key as SortableColumn)}
                  disabled={!column.sortable}
                >
                  <span className="truncate">{column.label}</span>
                  {renderSortIndicator(column.key)}
                </button>
                <div
                  className={cn(
                    "resizer absolute right-0 top-0 bottom-0",
                    resizingColumn === column.key && "bg-primary"
                  )}
                  onMouseDown={handleResizeStart(column.key)}
                />
              </div>
            ))}
          </div>

          {/* Virtual scrolling container */}
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visibleItems.map((item, index) => {
              const actualIndex = startIndex + index;
              const isSelected = selectedItemIds.includes(item.id);
              
              return (
                <div
                  key={item.id}
                  className={cn(
                    "list-row absolute w-full",
                    isSelected && "selected",
                    actualIndex % 2 === 1 && !isSelected && "bg-table-row-alt",
                    draggedItemId === item.id && "opacity-50",
                    dragOverItemId === item.id && "ring-2 ring-primary ring-inset"
                  )}
                  style={{ 
                    top: actualIndex * ROW_HEIGHT,
                    height: ROW_HEIGHT,
                    width: totalWidth,
                  }}
                  onClick={(e) => handleRowClick(item, e)}
                  onContextMenu={(e) => handleContextMenu(item, e)}
                  onDoubleClick={() => onEditItem(item)}
                  draggable={useManualOrder}
                  onDragStart={handleDragStart(item.id)}
                  onDragOver={handleDragOver(item.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop(item.id)}
                  onDragEnd={handleDragEnd}
                >
                  {useManualOrder && (
                    <div className="w-10 shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  {columns.map((column) => (
                    <div
                      key={column.key}
                      className="px-2 truncate shrink-0 flex items-center"
                      style={{ width: column.width }}
                    >
                      {getCellValue(item, column.key)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="context-menu fixed z-50 animate-fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item w-full"
            onClick={() => {
              const item = items.find(i => i.id === contextMenu.itemId);
              if (item) onEditItem(item);
              setContextMenu(null);
            }}
          >
            <Pencil className="w-4 h-4" />
            Edit
          </button>
          <div className="relative group">
            <button className="context-menu-item w-full">
              <FolderInput className="w-4 h-4" />
              Move to Category
              <span className="ml-auto">▸</span>
            </button>
            <div className="absolute left-full top-0 hidden group-hover:block">
              <div className="context-menu ml-1">
                {movableCategories.map(cat => (
                  <button
                    key={cat.id}
                    className="context-menu-item w-full"
                    onClick={() => {
                      onMoveItemsToCategory(
                        selectedItemIds.length > 0 ? selectedItemIds : [contextMenu.itemId],
                        cat.id
                      );
                      setContextMenu(null);
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="h-px bg-border my-1" />
          <button
            className="context-menu-item w-full text-destructive hover:text-destructive"
            onClick={() => {
              onDeleteItems(selectedItemIds.length > 0 ? selectedItemIds : [contextMenu.itemId]);
              setContextMenu(null);
            }}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

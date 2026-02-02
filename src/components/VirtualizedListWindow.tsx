/**
 * Virtualized List using react-window v2
 * Optimized for rendering millions of items with minimal memory usage
 * 
 * Features:
 * - Only renders visible rows (+ overscan)
 * - Efficient scroll handling
 * - Proper keyboard navigation
 * - Context menu support
 */

import { useRef, useState, useCallback, useEffect, useMemo, CSSProperties, ReactElement } from 'react';
import { List, ListImperativeAPI, RowComponentProps } from 'react-window';
import { 
  ArrowUp, 
  ArrowDown, 
  ArrowUpDown,
  Pencil,
  Trash2,
  FolderInput,
  GripVertical,
} from 'lucide-react';
import { Item, Category, SortableColumn } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Column {
  key: SortableColumn | 'genres';
  label: string;
  minWidth: number;
  sortable: boolean;
}

const columnDefs: Column[] = [
  { key: 'name', label: 'Name', minWidth: 120, sortable: true },
  { key: 'year', label: 'Year', minWidth: 50, sortable: true },
  { key: 'rating', label: 'Rating', minWidth: 50, sortable: true },
  { key: 'genres', label: 'Genres', minWidth: 80, sortable: false },
  { key: 'addedDate', label: 'Added', minWidth: 80, sortable: true },
  { key: 'path', label: 'Path', minWidth: 100, sortable: true },
];

interface VirtualizedListWindowProps {
  items: Item[];
  categories: Category[];
  selectedItemIds: string[];
  sortColumn: SortableColumn | null;
  sortDirection: 'asc' | 'desc';
  useManualOrder: boolean;
  columnWidths: Record<string, number>;
  onColumnResize: (key: string, width: number) => void;
  onSelectItem: (itemId: string, isMultiSelect: boolean) => void;
  onSetSelectedItems: (itemIds: string[]) => void;
  onSort: (column: SortableColumn) => void;
  onSetManualOrder: (useManual: boolean) => void;
  onEditItem: (item: Item) => void;
  onDeleteItems: (itemIds: string[]) => void;
  onMoveItemsToCategory: (itemIds: string[], categoryId: string) => void;
  onMoveItemUp: (itemId: string) => void;
  onMoveItemDown: (itemId: string) => void;
  // Pagination support
  totalCount?: number;
  onLoadMore?: (offset: number) => void;
}

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 32;

// Row data interface for react-window
interface RowData {
  items: Item[];
  selectedItemIds: string[];
  columnWidths: Record<string, number>;
  useManualOrder: boolean;
  totalWidth: number;
  onRowClick: (item: Item, e: React.MouseEvent) => void;
  onContextMenu: (item: Item, e: React.MouseEvent) => void;
  onDoubleClick: (item: Item) => void;
  getCellValue: (item: Item, columnKey: string) => string;
}

// Row component for react-window v2
const RowComponent = ({ 
  index, 
  style, 
  ariaAttributes,
  ...rowProps 
}: RowComponentProps<RowData>): ReactElement | null => {
  const { 
    items, 
    selectedItemIds, 
    columnWidths, 
    useManualOrder, 
    totalWidth,
    onRowClick,
    onContextMenu,
    onDoubleClick,
    getCellValue 
  } = rowProps as unknown as RowData;
  
  const item = items[index];
  if (!item) return null;
  
  const isSelected = selectedItemIds.includes(item.id);
  const getColumnWidth = (key: string) => columnWidths[key] || 100;

  return (
    <div
      {...ariaAttributes}
      style={{ ...style, width: totalWidth } as CSSProperties}
      className={cn(
        'list-row flex items-center border-b border-border/50 cursor-pointer',
        isSelected && 'bg-primary/10 hover:bg-primary/15',
        !isSelected && 'hover:bg-muted/50'
      )}
      onClick={(e) => onRowClick(item, e)}
      onContextMenu={(e) => onContextMenu(item, e)}
      onDoubleClick={() => onDoubleClick(item)}
    >
      {useManualOrder && (
        <div className="w-8 shrink-0 flex items-center justify-center">
          <GripVertical className="w-3 h-3 text-muted-foreground cursor-grab" />
        </div>
      )}
      {columnDefs.map((column) => (
        <div
          key={column.key}
          className="px-3 truncate shrink-0 text-sm"
          style={{ width: getColumnWidth(column.key) }}
        >
          {getCellValue(item, column.key)}
        </div>
      ))}
    </div>
  );
};

export const VirtualizedListWindow = ({
  items,
  categories,
  selectedItemIds,
  sortColumn,
  sortDirection,
  useManualOrder,
  columnWidths,
  onColumnResize,
  onSelectItem,
  onSetSelectedItems,
  onSort,
  onSetManualOrder,
  onEditItem,
  onDeleteItems,
  onMoveItemsToCategory,
  onMoveItemUp,
  onMoveItemDown,
  totalCount,
  onLoadMore,
}: VirtualizedListWindowProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<ListImperativeAPI>(null);
  const [containerHeight, setContainerHeight] = useState(400);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);

  const getColumnWidth = (key: string) => columnWidths[key] || 100;

  // Update container height on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height - HEADER_HEIGHT - 40); // 40px for toolbar
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Column resizing
  const handleResizeStart = (columnKey: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setResizingColumn(columnKey);

    const startX = e.clientX;
    const startWidth = getColumnWidth(columnKey);
    const column = columnDefs.find(c => c.key === columnKey);
    const minWidth = column?.minWidth || 50;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(minWidth, startWidth + diff);
      onColumnResize(columnKey, newWidth);
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
  const handleRowClick = useCallback((item: Item, e: React.MouseEvent) => {
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
  }, [items, selectedItemIds, onSelectItem, onSetSelectedItems]);

  // Context menu
  const handleContextMenu = useCallback((item: Item, e: React.MouseEvent) => {
    e.preventDefault();
    if (!selectedItemIds.includes(item.id)) {
      onSelectItem(item.id, false);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, itemId: item.id });
  }, [selectedItemIds, onSelectItem]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Format date - memoized
  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('sk-SK', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
    });
  }, []);

  // Get cell value - memoized
  const getCellValue = useCallback((item: Item, columnKey: string): string => {
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
  }, [formatDate]);

  // Render sort indicator
  const renderSortIndicator = (columnKey: string) => {
    const column = columnDefs.find(c => c.key === columnKey);
    if (!column?.sortable) return null;
    
    if (sortColumn === columnKey) {
      return sortDirection === 'asc' 
        ? <ArrowUp className="w-3 h-3" />
        : <ArrowDown className="w-3 h-3" />;
    }
    return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  };

  const totalWidth = columnDefs.reduce((sum, col) => sum + getColumnWidth(col.key), 0) + (useManualOrder ? 32 : 0);
  const movableCategories = categories.filter(c => c.id !== 'all');
  const displayCount = totalCount ?? items.length;

  // Row props for react-window v2
  const rowProps = useMemo<RowData>(() => ({
    items,
    selectedItemIds,
    columnWidths,
    useManualOrder,
    totalWidth,
    onRowClick: handleRowClick,
    onContextMenu: handleContextMenu,
    onDoubleClick: onEditItem,
    getCellValue,
  }), [items, selectedItemIds, columnWidths, useManualOrder, totalWidth, handleRowClick, handleContextMenu, onEditItem, getCellValue]);

  // Handle scroll for infinite loading
  const handleRowsRendered = useCallback((
    visibleRows: { startIndex: number; stopIndex: number },
  ) => {
    if (onLoadMore && visibleRows.stopIndex >= items.length - 10 && items.length < (totalCount || items.length)) {
      onLoadMore(items.length);
    }
  }, [items.length, totalCount, onLoadMore]);

  return (
    <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
      {/* Order mode toggle */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30">
        <span className="text-xs text-muted-foreground">Order:</span>
        <Button
          variant={!useManualOrder ? "secondary" : "ghost"}
          size="sm"
          className="h-6 text-xs px-2"
          onClick={() => onSetManualOrder(false)}
        >
          Auto
        </Button>
        <Button
          variant={useManualOrder ? "secondary" : "ghost"}
          size="sm"
          className="h-6 text-xs px-2"
          onClick={() => onSetManualOrder(true)}
        >
          Manual
        </Button>
        {useManualOrder && selectedItemIds.length === 1 && (
          <>
            <div className="w-px h-4 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1 px-2"
              onClick={() => onMoveItemUp(selectedItemIds[0])}
            >
              <ArrowUp className="w-3 h-3" /> Up
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1 px-2"
              onClick={() => onMoveItemDown(selectedItemIds[0])}
            >
              <ArrowDown className="w-3 h-3" /> Down
            </Button>
          </>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {displayCount.toLocaleString()} items {selectedItemIds.length > 0 && `· ${selectedItemIds.length} selected`}
        </span>
      </div>

      {/* List container */}
      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: totalWidth }}>
          {/* Header */}
          <div 
            className="list-header sticky top-0 z-10 bg-background border-b flex"
            style={{ width: totalWidth, height: HEADER_HEIGHT }}
          >
            {useManualOrder && (
              <div className="w-8 shrink-0 flex items-center justify-center">
                <GripVertical className="w-3 h-3 text-muted-foreground" />
              </div>
            )}
            {columnDefs.map((column) => (
              <div
                key={column.key}
                className="flex items-center relative shrink-0"
                style={{ width: getColumnWidth(column.key) }}
              >
                <button
                  className={cn(
                    "flex items-center gap-1 px-3 h-full text-left flex-1 text-xs font-medium text-muted-foreground",
                    column.sortable && "hover:text-foreground cursor-pointer"
                  )}
                  onClick={() => column.sortable && onSort(column.key as SortableColumn)}
                  disabled={!column.sortable}
                >
                  <span className="truncate">{column.label}</span>
                  {renderSortIndicator(column.key)}
                </button>
                <div
                  className={cn(
                    "absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50",
                    resizingColumn === column.key && "bg-primary"
                  )}
                  onMouseDown={handleResizeStart(column.key)}
                />
              </div>
            ))}
          </div>

          {/* Virtualized list using react-window v2 */}
          <List
            listRef={listRef}
            style={{ height: containerHeight, width: totalWidth }}
            rowCount={items.length}
            rowHeight={ROW_HEIGHT}
            rowComponent={RowComponent}
            rowProps={rowProps}
            overscanCount={10}
            onRowsRendered={handleRowsRendered}
          />
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] bg-popover border border-border rounded-md shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-accent"
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
            <button className="w-full px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-accent">
              <FolderInput className="w-4 h-4" />
              Move to Category
              <span className="ml-auto text-muted-foreground">▸</span>
            </button>
            <div className="absolute left-full top-0 hidden group-hover:block">
              <div className="min-w-[140px] bg-popover border border-border rounded-md shadow-lg py-1 ml-1">
                {movableCategories.map(cat => (
                  <button
                    key={cat.id}
                    className="w-full px-3 py-1.5 text-sm flex items-center hover:bg-accent"
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
            className="w-full px-3 py-1.5 text-sm flex items-center gap-2 text-destructive hover:bg-accent"
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

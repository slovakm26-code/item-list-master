import React, { memo } from 'react';
import { GripVertical } from 'lucide-react';
import { Item } from '@/types';
import { cn } from '@/lib/utils';

interface VirtualizedRowProps {
  item: Item;
  isSelected: boolean;
  columnWidths: Record<string, number>;
  useManualOrder: boolean;
  totalWidth: number;
  top: number;
  height: number;
  onRowClick: (item: Item, e: React.MouseEvent) => void;
  onContextMenu: (item: Item, e: React.MouseEvent) => void;
  onDoubleClick: (item: Item) => void;
  getCellValue: (item: Item, columnKey: string) => string;
}

const columnDefs = [
  { key: 'name' },
  { key: 'year' },
  { key: 'rating' },
  { key: 'genres' },
  { key: 'addedDate' },
  { key: 'path' },
];

export const VirtualizedRow = memo(({
  item,
  isSelected,
  columnWidths,
  useManualOrder,
  totalWidth,
  top,
  height,
  onRowClick,
  onContextMenu,
  onDoubleClick,
  getCellValue,
}: VirtualizedRowProps) => {
  const getColumnWidth = (key: string) => columnWidths[key] || 100;

  return (
    <div
      className={cn(
        "list-row absolute w-full",
        isSelected && "selected"
      )}
      style={{ 
        top,
        height,
        width: totalWidth,
      }}
      onClick={(e) => onRowClick(item, e)}
      onContextMenu={(e) => onContextMenu(item, e)}
      onDoubleClick={() => onDoubleClick(item)}
    >
      {useManualOrder && (
        <div className="w-8 shrink-0 flex items-center justify-center cursor-grab">
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </div>
      )}
      {columnDefs.map((column) => (
        <div
          key={column.key}
          className="px-3 truncate shrink-0 flex items-center"
          style={{ width: getColumnWidth(column.key) }}
        >
          {getCellValue(item, column.key)}
        </div>
      ))}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimal memoization
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.name === nextProps.item.name &&
    prevProps.item.year === nextProps.item.year &&
    prevProps.item.rating === nextProps.item.rating &&
    prevProps.item.addedDate === nextProps.item.addedDate &&
    prevProps.item.path === nextProps.item.path &&
    prevProps.item.genres.join(',') === nextProps.item.genres.join(',') &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.useManualOrder === nextProps.useManualOrder &&
    prevProps.top === nextProps.top &&
    prevProps.totalWidth === nextProps.totalWidth &&
    Object.keys(prevProps.columnWidths).every(
      key => prevProps.columnWidths[key] === nextProps.columnWidths[key]
    )
  );
});

VirtualizedRow.displayName = 'VirtualizedRow';

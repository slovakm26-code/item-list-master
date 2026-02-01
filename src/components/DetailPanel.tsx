import { useState, useRef, useEffect, useCallback } from 'react';
import { Pencil, Save, X, Star, Calendar, Folder, Film, ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react';
import { Item, Category } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const DETAIL_HEIGHT_KEY = 'stuff_organizer_detail_height';
const DETAIL_COLLAPSED_KEY = 'stuff_organizer_detail_collapsed';
const DEFAULT_HEIGHT = 200;
const MIN_HEIGHT = 120;
const MAX_HEIGHT_PERCENT = 0.5;

interface DetailPanelProps {
  item: Item | null;
  categories: Category[];
  onUpdateItem: (id: string, updates: Partial<Item>) => void;
  selectedCount: number;
}

export const DetailPanel = ({
  item,
  categories,
  onUpdateItem,
  selectedCount,
}: DetailPanelProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Item>>({});
  const [height, setHeight] = useState(() => {
    const stored = localStorage.getItem(DETAIL_HEIGHT_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_HEIGHT;
  });
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(DETAIL_COLLAPSED_KEY);
    return stored === 'true';
  });
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Save height to localStorage
  useEffect(() => {
    localStorage.setItem(DETAIL_HEIGHT_KEY, height.toString());
  }, [height]);

  // Save collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem(DETAIL_COLLAPSED_KEY, isCollapsed.toString());
  }, [isCollapsed]);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = height;
    const maxHeight = window.innerHeight * MAX_HEIGHT_PERCENT;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = startY - e.clientY;
      const newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, startHeight + diff));
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [height]);

  const startEditing = () => {
    if (item) {
      setEditData({
        name: item.name,
        year: item.year,
        rating: item.rating,
        genres: [...item.genres],
        description: item.description,
        path: item.path,
        categoryId: item.categoryId,
      });
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditData({});
  };

  const saveChanges = () => {
    if (item) {
      onUpdateItem(item.id, editData);
      setIsEditing(false);
      setEditData({});
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('sk-SK', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
    });
  };

  const movableCategories = categories.filter(c => c.id !== 'all');
  const category = item ? categories.find(c => c.id === item.categoryId) : null;

  const toggleCollapsed = () => {
    setIsCollapsed(!isCollapsed);
  };

  // Empty state content
  const renderEmptyContent = () => (
    <div className="flex-1 flex items-center justify-center py-8">
      <div className="text-center text-muted-foreground">
        <Film className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">
          {selectedCount > 1 
            ? `${selectedCount} items selected` 
            : 'No item selected'}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Toggle button - always visible at top */}
      <button
        onClick={toggleCollapsed}
        className="detail-toggle"
        title={isCollapsed ? 'Show details' : 'Hide details'}
      >
        {isCollapsed ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {/* Collapsible content */}
      <div 
        ref={panelRef}
        className={cn(
          "app-detail-wrapper relative transition-all duration-200 overflow-hidden",
          isCollapsed && "h-0"
        )}
        style={{ height: isCollapsed ? 0 : height }}
      >
        {/* Resize handle */}
        {!isCollapsed && (
          <div 
            className={cn(
              "detail-drag-handle",
              isResizing && "bg-primary"
            )}
            onMouseDown={handleResizeStart}
          >
            <GripHorizontal className="w-4 h-4 text-muted-foreground/50" />
          </div>
        )}

        {/* Panel content */}
        <div className="app-detail h-full px-6 py-4 overflow-x-auto">
          {!item || selectedCount > 1 ? (
            renderEmptyContent()
          ) : (
            <div className="flex gap-6 h-full">
              {/* Cover Image */}
              <div className="shrink-0">
                <div className="cover-container w-24 h-36">
                  {item.coverPath ? (
                    <img 
                      src={item.coverPath} 
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Film className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0 space-y-3">
                {/* Header with title and edit button */}
                <div className="flex items-start gap-3">
                  {isEditing ? (
                    <Input
                      value={editData.name || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                      className="text-lg font-semibold h-8"
                    />
                  ) : (
                    <h2 className="text-lg font-semibold truncate flex-1">{item.name}</h2>
                  )}
                  
                  {isEditing ? (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="w-7 h-7" onClick={cancelEditing}>
                        <X className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-primary" onClick={saveChanges}>
                        <Save className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0" onClick={startEditing}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    {isEditing ? (
                      <Input
                        type="number"
                        value={editData.year || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, year: parseInt(e.target.value) || null }))}
                        className="h-6 w-20"
                      />
                    ) : (
                      <span>{item.year || '-'}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-warning" />
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={editData.rating || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, rating: parseFloat(e.target.value) || null }))}
                        className="h-6 w-16"
                      />
                    ) : (
                      <span>{item.rating?.toFixed(1) || '-'}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-muted-foreground" />
                    {isEditing ? (
                      <Select
                        value={editData.categoryId}
                        onValueChange={(value) => setEditData(prev => ({ ...prev, categoryId: value }))}
                      >
                        <SelectTrigger className="h-6 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {movableCategories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span>{category?.name || 'Unknown'}</span>
                    )}
                  </div>

                  <span className="text-muted-foreground">
                    Added: {formatDate(item.addedDate)}
                  </span>
                </div>

                {/* Genres */}
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      value={(editData.genres || []).join(', ')}
                      onChange={(e) => setEditData(prev => ({ 
                        ...prev, 
                        genres: e.target.value.split(',').map(g => g.trim()).filter(Boolean)
                      }))}
                      placeholder="Comma-separated genres"
                      className="h-7"
                    />
                  ) : (
                    item.genres.length > 0 ? item.genres.map((genre, i) => (
                      <span 
                        key={i}
                        className="px-2 py-0.5 bg-muted text-muted-foreground text-xs"
                      >
                        {genre}
                      </span>
                    )) : (
                      <span className="text-sm text-muted-foreground">No genres</span>
                    )
                  )}
                </div>
              </div>

              {/* Description and Path */}
              <div className="w-80 shrink-0 space-y-3 border-l pl-6">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">Description</label>
                  {isEditing ? (
                    <Textarea
                      value={editData.description || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="resize-none mt-1"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                      {item.description || 'No description available.'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide">Path</label>
                  {isEditing ? (
                    <Input
                      value={editData.path || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, path: e.target.value }))}
                      className="h-7 mt-1"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1 truncate">{item.path || '-'}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

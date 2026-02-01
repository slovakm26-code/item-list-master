import { useState } from 'react';
import { Pencil, Save, X, Star, Calendar, Folder, Film, ChevronUp, ChevronDown, GripHorizontal } from 'lucide-react';
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

interface DetailPanelProps {
  item: Item | null;
  categories: Category[];
  onUpdateItem: (id: string, updates: Partial<Item>) => void;
  selectedCount: number;
  height: number;
  visible: boolean;
  onHeightChange: (height: number) => void;
  onToggleVisible: () => void;
}

export const DetailPanel = ({
  item,
  categories,
  onUpdateItem,
  selectedCount,
  height,
  visible,
  onHeightChange,
  onToggleVisible,
}: DetailPanelProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Item>>({});
  const [isResizing, setIsResizing] = useState(false);

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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = height;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = startY - e.clientY;
      onHeightChange(startHeight + diff);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const movableCategories = categories.filter(c => c.id !== 'all');
  const category = item ? categories.find(c => c.id === item.categoryId) : null;

  return (
    <div className="app-detail" style={{ height: visible ? height : 40 }}>
      {/* Resize handle */}
      {visible && (
        <div
          className={cn(
            "resizer-horizontal",
            isResizing && "bg-primary"
          )}
          onMouseDown={handleResizeStart}
        >
          <GripHorizontal className="w-4 h-4 text-muted-foreground/50" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-2 border-b">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6"
            onClick={onToggleVisible}
          >
            {visible ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </Button>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Details
          </span>
        </div>
        {visible && item && (
          isEditing ? (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="w-6 h-6" onClick={cancelEditing}>
                <X className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="w-6 h-6 text-primary" onClick={saveChanges}>
                <Save className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="icon" className="w-6 h-6" onClick={startEditing}>
              <Pencil className="w-4 h-4" />
            </Button>
          )
        )}
      </div>

      {/* Content */}
      {visible && (
        <div className="app-detail-content">
          {selectedCount > 1 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <p className="text-sm">{selectedCount} items selected</p>
              </div>
            </div>
          ) : !item ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <p className="text-sm">Select an item to view details</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-8">
              {/* Cover Image */}
              <div className="shrink-0">
                <div className="cover-container w-32">
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

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-4">
                {/* Title */}
                <div>
                  {isEditing ? (
                    <Input
                      value={editData.name || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                      className="text-lg font-semibold h-9"
                    />
                  ) : (
                    <h2 className="text-lg font-semibold truncate">{item.name}</h2>
                  )}
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-4 gap-6">
                  <div className="detail-section">
                    <label className="detail-label">Year</label>
                    {isEditing ? (
                      <Input
                        type="number"
                        value={editData.year || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, year: parseInt(e.target.value) || null }))}
                        className="h-8"
                      />
                    ) : (
                      <p className="detail-value flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        {item.year || '-'}
                      </p>
                    )}
                  </div>

                  <div className="detail-section">
                    <label className="detail-label">Rating</label>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={editData.rating || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, rating: parseFloat(e.target.value) || null }))}
                        className="h-8"
                      />
                    ) : (
                      <p className="detail-value flex items-center gap-1">
                        <Star className="w-3 h-3 text-warning" />
                        {item.rating?.toFixed(1) || '-'}
                      </p>
                    )}
                  </div>

                  <div className="detail-section">
                    <label className="detail-label">Category</label>
                    {isEditing ? (
                      <Select
                        value={editData.categoryId}
                        onValueChange={(value) => setEditData(prev => ({ ...prev, categoryId: value }))}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {movableCategories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.emoji} {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="detail-value flex items-center gap-1">
                        <span>{category?.emoji}</span>
                        {category?.name || 'Unknown'}
                      </p>
                    )}
                  </div>

                  <div className="detail-section">
                    <label className="detail-label">Added</label>
                    <p className="detail-value text-muted-foreground">{formatDate(item.addedDate)}</p>
                  </div>
                </div>

                {/* Genres */}
                <div className="detail-section">
                  <label className="detail-label">Genres</label>
                  {isEditing ? (
                    <Input
                      value={(editData.genres || []).join(', ')}
                      onChange={(e) => setEditData(prev => ({ 
                        ...prev, 
                        genres: e.target.value.split(',').map(g => g.trim()).filter(Boolean)
                      }))}
                      placeholder="Comma-separated genres"
                      className="h-8"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {item.genres.length > 0 ? item.genres.map((genre, i) => (
                        <span 
                          key={i}
                          className="px-2 py-0.5 bg-muted text-muted-foreground text-xs"
                          style={{ borderRadius: '2px' }}
                        >
                          {genre}
                        </span>
                      )) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Path */}
                <div className="detail-section">
                  <label className="detail-label">Path</label>
                  {isEditing ? (
                    <Input
                      value={editData.path || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, path: e.target.value }))}
                      className="h-8"
                    />
                  ) : (
                    <p className="detail-value text-muted-foreground truncate">{item.path || '-'}</p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="w-80 shrink-0 detail-section">
                <label className="detail-label">Description</label>
                {isEditing ? (
                  <Textarea
                    value={editData.description || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                    rows={6}
                    className="resize-none"
                  />
                ) : (
                  <p className="detail-value text-muted-foreground leading-relaxed line-clamp-6">
                    {item.description || 'No description available.'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

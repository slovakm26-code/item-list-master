import { useState } from 'react';
import { Pencil, Save, X, Star, Calendar, Folder, Film } from 'lucide-react';
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
}

export const DetailPanel = ({
  item,
  categories,
  onUpdateItem,
  selectedCount,
}: DetailPanelProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Item>>({});

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

  const movableCategories = categories.filter(c => c.id !== 'all');

  if (selectedCount > 1) {
    return (
      <div className="app-detail">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">{selectedCount} items selected</p>
            <p className="text-sm mt-1">Select a single item to view details</p>
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="app-detail">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No item selected</p>
            <p className="text-sm mt-1">Select an item to view details</p>
          </div>
        </div>
      </div>
    );
  }

  const category = categories.find(c => c.id === item.categoryId);

  return (
    <div className="app-detail">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold truncate">Item Details</h3>
        {isEditing ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={cancelEditing}>
              <X className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="w-7 h-7 text-primary" onClick={saveChanges}>
              <Save className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={startEditing}>
            <Pencil className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Cover Image */}
        <div className="cover-container w-full max-w-[240px] mx-auto">
          {item.coverPath ? (
            <img 
              src={item.coverPath} 
              alt={item.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Film className="w-16 h-16 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Title */}
        <div>
          {isEditing ? (
            <Input
              value={editData.name || ''}
              onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
              className="text-lg font-semibold"
            />
          ) : (
            <h2 className="text-lg font-semibold">{item.name}</h2>
          )}
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">Year</label>
            {isEditing ? (
              <Input
                type="number"
                value={editData.year || ''}
                onChange={(e) => setEditData(prev => ({ ...prev, year: parseInt(e.target.value) || null }))}
                className="h-8"
              />
            ) : (
              <p className="text-sm flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {item.year || '-'}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">Rating</label>
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
              <p className="text-sm flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-warning" />
                {item.rating?.toFixed(1) || '-'}
              </p>
            )}
          </div>
        </div>

        {/* Category */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">Category</label>
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
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm flex items-center gap-1">
              <Folder className="w-3.5 h-3.5" />
              {category?.name || 'Unknown'}
            </p>
          )}
        </div>

        {/* Genres */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">Genres</label>
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
                  className="px-2 py-0.5 bg-accent text-accent-foreground rounded text-xs"
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
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">Path</label>
          {isEditing ? (
            <Input
              value={editData.path || ''}
              onChange={(e) => setEditData(prev => ({ ...prev, path: e.target.value }))}
              className="h-8"
            />
          ) : (
            <p className="text-sm text-muted-foreground break-all">{item.path || '-'}</p>
          )}
        </div>

        {/* Added Date */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">Added</label>
          <p className="text-sm text-muted-foreground">{formatDate(item.addedDate)}</p>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground uppercase tracking-wide">Description</label>
          {isEditing ? (
            <Textarea
              value={editData.description || ''}
              onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
              rows={6}
              className="resize-none"
            />
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {item.description || 'No description available.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

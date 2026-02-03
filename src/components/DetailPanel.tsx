import { useState } from 'react';
import { Pencil, Save, X, Star, ChevronUp, ChevronDown, GripHorizontal, Film, Check } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { getIconByName, emojiToIconMap } from './IconPicker';

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
        season: item.season,
        episode: item.episode,
        watched: item.watched,
        customFieldValues: item.customFieldValues ? { ...item.customFieldValues } : {},
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

  const getCategoryIcon = (cat: Category) => {
    if (cat.icon) return getIconByName(cat.icon);
    if (cat.emoji && emojiToIconMap[cat.emoji]) return getIconByName(emojiToIconMap[cat.emoji]);
    return getIconByName('folder');
  };

  const CategoryIcon = category ? getCategoryIcon(category) : null;

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
            <div className="flex gap-6">
              {/* Cover Image - Left side */}
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

              {/* Info Section - Right side */}
              <div className="flex-1 min-w-0 flex flex-col">
                {/* Title + Rating row */}
                <div className="flex items-center justify-between gap-4">
                  {isEditing ? (
                    <Input
                      value={editData.name || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                      className="text-lg font-semibold h-9 flex-1"
                    />
                  ) : (
                    <h2 className="text-lg font-semibold truncate flex-1">{item.name}</h2>
                  )}
                  
                  {isEditing ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <Star className="w-5 h-5 text-warning" />
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={editData.rating || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, rating: parseFloat(e.target.value) || null }))}
                        className="h-9 w-20"
                      />
                      <span className="text-muted-foreground">/10</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Star className="w-5 h-5 text-warning fill-warning" />
                      <span className="text-lg font-semibold">{item.rating?.toFixed(1) || '-'}</span>
                      <span className="text-muted-foreground">/10</span>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="h-px bg-border my-3" />

                {/* Description */}
                {(isEditing || item.description) && (
                  <div className="flex-1 min-h-0">
                    {isEditing ? (
                      <Textarea
                        value={editData.description || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                        rows={4}
                        className="resize-none"
                        placeholder="Description..."
                      />
                    ) : (
                      <p className="text-sm text-foreground leading-relaxed line-clamp-4">
                        {item.description}
                      </p>
                    )}
                  </div>
                )}

                {/* Meta info - bottom */}
                {(isEditing || item.year || item.genres.length > 0 || category || item.season || item.episode) && (
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    {isEditing ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span>Year:</span>
                          <Input
                            type="number"
                            value={editData.year || ''}
                            onChange={(e) => setEditData(prev => ({ ...prev, year: parseInt(e.target.value) || null }))}
                            className="h-7 w-20"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Season:</span>
                          <Input
                            type="number"
                            min="1"
                            value={editData.season || ''}
                            onChange={(e) => setEditData(prev => ({ ...prev, season: parseInt(e.target.value) || null }))}
                            className="h-7 w-16"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Episode:</span>
                          <Input
                            type="number"
                            min="1"
                            value={editData.episode || ''}
                            onChange={(e) => setEditData(prev => ({ ...prev, episode: parseInt(e.target.value) || null }))}
                            className="h-7 w-16"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Genres:</span>
                          <Input
                            value={(editData.genres || []).join(', ')}
                            onChange={(e) => setEditData(prev => ({ 
                              ...prev, 
                              genres: e.target.value.split(',').map(g => g.trim()).filter(Boolean)
                            }))}
                            placeholder="Comma-separated"
                            className="h-7 w-40"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Category:</span>
                          <Select
                            value={editData.categoryId}
                            onValueChange={(value) => setEditData(prev => ({ ...prev, categoryId: value }))}
                          >
                            <SelectTrigger className="h-7 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {movableCategories.map(cat => {
                                const Icon = getCategoryIcon(cat);
                                return (
                                  <SelectItem key={cat.id} value={cat.id}>
                                    <div className="flex items-center gap-2">
                                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                                      {cat.name}
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="watched-edit"
                            checked={editData.watched || false}
                            onCheckedChange={(checked) => setEditData(prev => ({ ...prev, watched: checked === true }))}
                          />
                          <label htmlFor="watched-edit" className="cursor-pointer">Watched</label>
                        </div>
                      </>
                    ) : (
                      <>
                        {item.watched && (
                          <>
                            <span className="flex items-center gap-1 text-foreground">
                              <Check className="w-3.5 h-3.5" />
                              Watched
                            </span>
                            <span>•</span>
                          </>
                        )}
                        {item.year && (
                          <>
                            <span>Year: <span className="text-foreground">{item.year}</span></span>
                            {(item.season || item.episode || item.genres.length > 0 || category) && <span>•</span>}
                          </>
                        )}
                        {(item.season || item.episode) && (
                          <>
                            <span>
                              {item.season && <>S{item.season.toString().padStart(2, '0')}</>}
                              {item.episode && <>E{item.episode.toString().padStart(2, '0')}</>}
                            </span>
                            {(item.genres.length > 0 || category) && <span>•</span>}
                          </>
                        )}
                        {item.genres.length > 0 && (
                          <>
                            <span>Genre: <span className="text-foreground">{item.genres.join(', ')}</span></span>
                            {category && <span>•</span>}
                          </>
                        )}
                        {category && (
                          <span className="flex items-center gap-1">
                            {CategoryIcon && <CategoryIcon className="w-3.5 h-3.5" />}
                            {category.name}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Path and Added date */}
                {(isEditing || item.path) && (
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <span>Path:</span>
                        <Input
                          value={editData.path || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, path: e.target.value }))}
                          className="h-7 flex-1"
                        />
                      </div>
                    ) : (
                      <p className="truncate">Path: <span className="text-foreground/70">{item.path}</span></p>
                    )}
                  </div>
                )}
                
                {/* Custom Fields */}
                {category?.customFields && category.customFields.length > 0 && (
                  isEditing ? (
                    <div className="mt-3 grid gap-2">
                      {category.customFields.map(field => {
                        const value = editData.customFieldValues?.[field.id] ?? '';
                        
                        return (
                          <div key={field.id} className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground w-24 shrink-0">{field.name}:</span>
                            {field.type === 'checkbox' ? (
                              <Checkbox
                                checked={!!value}
                                onCheckedChange={(checked) => setEditData(prev => ({
                                  ...prev,
                                  customFieldValues: {
                                    ...prev.customFieldValues,
                                    [field.id]: checked === true
                                  }
                                }))}
                              />
                            ) : field.type === 'select' ? (
                              <Select
                                value={String(value || '')}
                                onValueChange={(val) => setEditData(prev => ({
                                  ...prev,
                                  customFieldValues: {
                                    ...prev.customFieldValues,
                                    [field.id]: val
                                  }
                                }))}
                              >
                                <SelectTrigger className="h-7 w-40">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {field.options?.map(opt => (
                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : field.type === 'number' ? (
                              <Input
                                type="number"
                                value={typeof value === 'number' ? value : (typeof value === 'string' ? value : '')}
                                onChange={(e) => setEditData(prev => ({
                                  ...prev,
                                  customFieldValues: {
                                    ...prev.customFieldValues,
                                    [field.id]: e.target.value ? parseFloat(e.target.value) : null
                                  }
                                }))}
                                className="h-7 w-24"
                              />
                            ) : field.type === 'date' ? (
                              <Input
                                type="date"
                                value={typeof value === 'string' ? value : ''}
                                onChange={(e) => setEditData(prev => ({
                                  ...prev,
                                  customFieldValues: {
                                    ...prev.customFieldValues,
                                    [field.id]: e.target.value
                                  }
                                }))}
                                className="h-7 w-36"
                              />
                            ) : (
                              <Input
                                type="text"
                                value={typeof value === 'string' ? value : ''}
                                onChange={(e) => setEditData(prev => ({
                                  ...prev,
                                  customFieldValues: {
                                    ...prev.customFieldValues,
                                    [field.id]: e.target.value
                                  }
                                }))}
                                className="h-7 flex-1"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    item.customFieldValues && Object.keys(item.customFieldValues).length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                        {category.customFields.map(field => {
                          const value = item.customFieldValues?.[field.id];
                          if (value === undefined || value === null || value === '') return null;
                          
                          let displayValue: string;
                          if (field.type === 'checkbox') {
                            displayValue = value ? 'Yes' : 'No';
                          } else if (field.type === 'date' && typeof value === 'string') {
                            displayValue = new Date(value).toLocaleDateString('sk-SK');
                          } else {
                            displayValue = String(value);
                          }
                          
                          return (
                            <span key={field.id}>
                              {field.name}: <span className="text-foreground">{displayValue}</span>
                            </span>
                          );
                        })}
                      </div>
                    )
                  )
                )}
                
                {/* Added date - always show */}
                <div className="mt-2 text-sm text-muted-foreground">
                  <p>Added: <span className="text-foreground/70">{formatDate(item.addedDate)}</span></p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

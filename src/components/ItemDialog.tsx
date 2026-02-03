import { useState, useEffect, useRef, useMemo } from 'react';
import { Item, Category, CustomFieldDefinition, DEFAULT_ENABLED_FIELDS } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Link, X, Loader2 } from 'lucide-react';
import { compressImage, formatBytes, estimateBase64Size } from '@/lib/imageUtils';

interface ItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Item | null;
  categories: Category[];
  defaultCategoryId: string | null;
  onSave: (item: Omit<Item, 'id' | 'orderIndex' | 'addedDate'>) => void;
  onUpdate: (id: string, updates: Partial<Item>) => void;
}

// Helper to get enabled fields for a category
const getEnabledFields = (category: Category | undefined) => {
  return category?.enabledFields || DEFAULT_ENABLED_FIELDS;
};

export const ItemDialog = ({
  open,
  onOpenChange,
  item,
  categories,
  defaultCategoryId,
  onSave,
  onUpdate,
}: ItemDialogProps) => {
  const [formData, setFormData] = useState({
    name: '',
    year: '',
    rating: '',
    genres: '',
    description: '',
    categoryId: '',
    path: '',
    coverPath: '',
    season: '',
    episode: '',
    watched: false,
  });
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | number | boolean>>({});
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverInputMode, setCoverInputMode] = useState<'url' | 'file'>('url');
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  // Get the selected category and its fields
  const selectedCategory = useMemo(() => 
    categories.find(c => c.id === formData.categoryId),
    [categories, formData.categoryId]
  );
  const enabledFields = useMemo(() => getEnabledFields(selectedCategory), [selectedCategory]);
  const customFields = selectedCategory?.customFields || [];

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name,
        year: item.year?.toString() || '',
        rating: item.rating?.toString() || '',
        genres: item.genres.join(', '),
        description: item.description,
        categoryId: item.categoryId,
        path: item.path,
        coverPath: item.coverPath,
        season: item.season?.toString() || '',
        episode: item.episode?.toString() || '',
        watched: item.watched || false,
      });
      setCustomFieldValues(item.customFieldValues || {});
    } else {
      const defaultCat = defaultCategoryId && defaultCategoryId !== 'all' 
        ? defaultCategoryId 
        : categories.find(c => c.id !== 'all')?.id || '';
      
      setFormData({
        name: '',
        year: '',
        rating: '',
        genres: '',
        description: '',
        categoryId: defaultCat,
        path: '',
        coverPath: '',
        season: '',
        episode: '',
        watched: false,
      });
      setCustomFieldValues({});
    }
  }, [item, defaultCategoryId, categories, open]);

  const handleSubmit = () => {
    // If file is uploaded, use the base64 preview as coverPath
    const finalCoverPath = coverInputMode === 'file' && coverPreview 
      ? coverPreview 
      : formData.coverPath.trim();

    const itemData = {
      name: formData.name.trim(),
      year: enabledFields.year && formData.year ? parseInt(formData.year) : null,
      rating: enabledFields.rating && formData.rating ? parseFloat(formData.rating) : null,
      genres: enabledFields.genres ? formData.genres.split(',').map(g => g.trim()).filter(Boolean) : [],
      description: enabledFields.description ? formData.description.trim() : '',
      categoryId: formData.categoryId,
      path: enabledFields.path ? formData.path.trim() : '',
      coverPath: finalCoverPath,
      season: enabledFields.season && formData.season ? parseInt(formData.season) : null,
      episode: enabledFields.episode && formData.episode ? parseInt(formData.episode) : null,
      watched: enabledFields.watched ? formData.watched : false,
      customFieldValues: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
    };

    if (!itemData.name) return;

    if (item) {
      onUpdate(item.id, itemData);
    } else {
      onSave(itemData);
    }
    
    // Reset file state
    setCoverFile(null);
    setCoverPreview(null);
    setCustomFieldValues({});
    onOpenChange(false);
  };

  // Render a custom field input based on its type
  const renderCustomField = (field: CustomFieldDefinition) => {
    const value = customFieldValues[field.id];
    
    switch (field.type) {
      case 'text':
        return (
          <Input
            value={(value as string) || ''}
            onChange={(e) => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
            placeholder={field.placeholder || `Enter ${field.name.toLowerCase()}`}
          />
        );
      case 'number':
        return (
          <Input
            type="number"
            min={field.min}
            max={field.max}
            value={(value as number) ?? ''}
            onChange={(e) => setCustomFieldValues(prev => ({ 
              ...prev, 
              [field.id]: e.target.value ? parseFloat(e.target.value) : '' 
            }))}
            placeholder={field.placeholder || '0'}
          />
        );
      case 'checkbox':
        return (
          <div className="flex items-center gap-2 h-10">
            <Checkbox
              id={`custom-${field.id}`}
              checked={!!value}
              onCheckedChange={(checked) => setCustomFieldValues(prev => ({ ...prev, [field.id]: checked === true }))}
            />
            <Label htmlFor={`custom-${field.id}`} className="text-sm font-normal cursor-pointer">
              {field.name}
            </Label>
          </div>
        );
      case 'select':
        return (
          <Select
            value={(value as string) || ''}
            onValueChange={(v) => setCustomFieldValues(prev => ({ ...prev, [field.id]: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.name.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'date':
        return (
          <Input
            type="date"
            value={(value as string) || ''}
            onChange={(e) => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
          />
        );
      default:
        return null;
    }
  };

  const movableCategories = categories.filter(c => c.id !== 'all');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Item' : 'Add New Item'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter item name"
            />
          </div>

          {/* Category selector - always visible */}
          <div className="grid gap-2">
            <Label htmlFor="category">Category *</Label>
            <Select
              value={formData.categoryId}
              onValueChange={(value) => setFormData(prev => ({ ...prev, categoryId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {movableCategories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Built-in fields - conditionally shown based on category config */}
          <div className="grid grid-cols-2 gap-4">
            {enabledFields.year && (
              <div className="grid gap-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData(prev => ({ ...prev, year: e.target.value }))}
                  placeholder="2024"
                />
              </div>
            )}
            {enabledFields.rating && (
              <div className="grid gap-2">
                <Label htmlFor="rating">Rating (0-10)</Label>
                <Input
                  id="rating"
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={formData.rating}
                  onChange={(e) => setFormData(prev => ({ ...prev, rating: e.target.value }))}
                  placeholder="8.5"
                />
              </div>
            )}
            {enabledFields.season && (
              <div className="grid gap-2">
                <Label htmlFor="season">Season</Label>
                <Input
                  id="season"
                  type="number"
                  min="1"
                  value={formData.season}
                  onChange={(e) => setFormData(prev => ({ ...prev, season: e.target.value }))}
                  placeholder="1"
                />
              </div>
            )}
            {enabledFields.episode && (
              <div className="grid gap-2">
                <Label htmlFor="episode">Episode</Label>
                <Input
                  id="episode"
                  type="number"
                  min="1"
                  value={formData.episode}
                  onChange={(e) => setFormData(prev => ({ ...prev, episode: e.target.value }))}
                  placeholder="1"
                />
              </div>
            )}
          </div>

          {enabledFields.watched && (
            <div className="grid gap-2">
              <Label>Status</Label>
              <div className="flex items-center gap-2 h-10">
                <Checkbox
                  id="watched"
                  checked={formData.watched}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, watched: checked === true }))}
                />
                <Label htmlFor="watched" className="text-sm font-normal cursor-pointer">
                  Watched / Completed
                </Label>
              </div>
            </div>
          )}

          {enabledFields.genres && (
            <div className="grid gap-2">
              <Label htmlFor="genres">Genres</Label>
              <Input
                id="genres"
                value={formData.genres}
                onChange={(e) => setFormData(prev => ({ ...prev, genres: e.target.value }))}
                placeholder="Action, Drama, Thriller"
              />
              <p className="text-xs text-muted-foreground">Separate genres with commas</p>
            </div>
          )}

          {enabledFields.path && (
            <div className="grid gap-2">
              <Label htmlFor="path">Path</Label>
              <Input
                id="path"
                value={formData.path}
                onChange={(e) => setFormData(prev => ({ ...prev, path: e.target.value }))}
                placeholder="C:\Movies\Example"
              />
            </div>
          )}

          {/* Custom Fields Section */}
          {customFields.length > 0 && (
            <div className="space-y-4 pt-2 border-t">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Custom Fields
              </Label>
              <div className="grid grid-cols-2 gap-4">
                {customFields.map(field => (
                  <div key={field.id} className={field.type === 'checkbox' ? '' : 'grid gap-2'}>
                    {field.type !== 'checkbox' && (
                      <Label htmlFor={`custom-${field.id}`}>
                        {field.name}{field.required && ' *'}
                      </Label>
                    )}
                    {renderCustomField(field)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Cover Image</Label>
            <Tabs value={coverInputMode} onValueChange={(v) => setCoverInputMode(v as 'url' | 'file')}>
              <TabsList className="grid w-full grid-cols-2 h-8">
                <TabsTrigger value="url" className="text-xs gap-1">
                  <Link className="w-3 h-3" />
                  URL
                </TabsTrigger>
                <TabsTrigger value="file" className="text-xs gap-1">
                  <Upload className="w-3 h-3" />
                  Upload
                </TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="mt-2">
                <Input
                  value={formData.coverPath}
                  onChange={(e) => setFormData(prev => ({ ...prev, coverPath: e.target.value }))}
                  placeholder="https://example.com/cover.jpg"
                />
              </TabsContent>
              <TabsContent value="file" className="mt-2">
                <input
                  ref={coverFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCoverFile(file);
                      setIsCompressing(true);
                      setCompressedSize(null);
                      try {
                        // Compress image to max 600x900, quality 85%
                        const compressed = await compressImage(file, {
                          maxWidth: 600,
                          maxHeight: 900,
                          quality: 0.85,
                          format: 'jpeg',
                        });
                        setCoverPreview(compressed);
                        setCompressedSize(estimateBase64Size(compressed));
                      } catch (err) {
                        console.error('Failed to compress image:', err);
                        // Fallback to original
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const result = ev.target?.result as string;
                          setCoverPreview(result);
                          setCompressedSize(estimateBase64Size(result));
                        };
                        reader.readAsDataURL(file);
                      } finally {
                        setIsCompressing(false);
                      }
                    }
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => coverFileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {coverFile ? coverFile.name : 'Choose File'}
                  </Button>
                  {coverFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setCoverFile(null);
                        setCoverPreview(null);
                        if (coverFileInputRef.current) {
                          coverFileInputRef.current.value = '';
                        }
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {isCompressing && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Optimalizujem obrázok...
                  </div>
                )}
                {coverPreview && !isCompressing && (
                  <div className="mt-2 flex items-start gap-3">
                    <img 
                      src={coverPreview} 
                      alt="Cover preview" 
                      className="w-20 h-28 object-cover rounded-md border border-border"
                    />
                    <div className="text-xs text-muted-foreground">
                      <p>Veľkosť: {compressedSize ? formatBytes(compressedSize) : 'N/A'}</p>
                      <p className="text-green-600 dark:text-green-400">✓ Optimalizované</p>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
            <p className="text-xs text-muted-foreground">
              {coverInputMode === 'file' 
                ? 'Image will be embedded in the backup file'
                : 'Enter a URL to an image'}
            </p>
          </div>

          {enabledFields.description && (
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter a description..."
                rows={4}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!formData.name.trim() || !formData.categoryId}>
            {item ? 'Save Changes' : 'Add Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

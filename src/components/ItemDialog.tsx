import { useState, useEffect, useRef } from 'react';
import { Item, Category } from '@/types';
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
  });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverInputMode, setCoverInputMode] = useState<'url' | 'file'>('url');
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

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
      });
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
      });
    }
  }, [item, defaultCategoryId, categories, open]);

  const handleSubmit = () => {
    // If file is uploaded, use the base64 preview as coverPath
    const finalCoverPath = coverInputMode === 'file' && coverPreview 
      ? coverPreview 
      : formData.coverPath.trim();

    const itemData = {
      name: formData.name.trim(),
      year: formData.year ? parseInt(formData.year) : null,
      rating: formData.rating ? parseFloat(formData.rating) : null,
      genres: formData.genres.split(',').map(g => g.trim()).filter(Boolean),
      description: formData.description.trim(),
      categoryId: formData.categoryId,
      path: formData.path.trim(),
      coverPath: finalCoverPath,
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
    onOpenChange(false);
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

          <div className="grid grid-cols-2 gap-4">
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
          </div>

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

          <div className="grid gap-2">
            <Label htmlFor="path">Path</Label>
            <Input
              id="path"
              value={formData.path}
              onChange={(e) => setFormData(prev => ({ ...prev, path: e.target.value }))}
              placeholder="C:\Movies\Example"
            />
          </div>

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

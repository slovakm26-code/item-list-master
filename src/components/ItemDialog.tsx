import { useState, useEffect } from 'react';
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
    const itemData = {
      name: formData.name.trim(),
      year: formData.year ? parseInt(formData.year) : null,
      rating: formData.rating ? parseFloat(formData.rating) : null,
      genres: formData.genres.split(',').map(g => g.trim()).filter(Boolean),
      description: formData.description.trim(),
      categoryId: formData.categoryId,
      path: formData.path.trim(),
      coverPath: formData.coverPath.trim(),
    };

    if (!itemData.name) return;

    if (item) {
      onUpdate(item.id, itemData);
    } else {
      onSave(itemData);
    }
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
            <Label htmlFor="coverPath">Cover Image URL</Label>
            <Input
              id="coverPath"
              value={formData.coverPath}
              onChange={(e) => setFormData(prev => ({ ...prev, coverPath: e.target.value }))}
              placeholder="https://example.com/cover.jpg"
            />
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

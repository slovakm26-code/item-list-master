import { useState, useCallback } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  FolderPlus,
  Folder,
  Film,
  Tv,
  Gamepad2,
  Music,
  BookOpen,
  Package,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { Category } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { IconPicker, getIconByName, emojiToIconMap } from './IconPicker';
import { CategoryFieldsDialog } from './CategoryFieldsDialog';

// Default icon mapping for built-in categories
const defaultCategoryIcons: Record<string, LucideIcon> = {
  all: Folder,
  movies: Film,
  series: Tv,
  games: Gamepad2,
  music: Music,
  books: BookOpen,
  apps: Package,
};

interface CategoryTreeProps {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onAddCategory: (name: string, parentId: string | null, icon?: string) => void;
  onUpdateCategory: (id: string, updates: Partial<Category>) => void;
  onDeleteCategory: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  getCategoryItemCount: (categoryId: string) => number;
}

interface TreeNodeProps {
  category: Category;
  categories: Category[];
  level: number;
  selectedCategoryId: string | null;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onEdit: (category: Category) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onAddSubcategory: (parentId: string) => void;
  onConfigureFields: (category: Category) => void;
  getCategoryItemCount: (categoryId: string) => number;
}

const getCategoryIcon = (category: Category): LucideIcon => {
  // Check if category has a custom icon
  if (category.icon) {
    return getIconByName(category.icon);
  }
  // Check if there's an emoji that can be mapped
  if (category.emoji && emojiToIconMap[category.emoji]) {
    return getIconByName(emojiToIconMap[category.emoji]);
  }
  // Check for built-in category icons
  if (defaultCategoryIcons[category.id]) {
    return defaultCategoryIcons[category.id];
  }
  // Default to folder
  return Folder;
};

const TreeNode = ({
  category,
  categories,
  level,
  selectedCategoryId,
  expandedIds,
  onToggleExpand,
  onSelect,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddSubcategory,
  onConfigureFields,
  getCategoryItemCount,
}: TreeNodeProps) => {
  const children = categories
    .filter(c => c.parentId === category.id)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(category.id);
  const isSelected = selectedCategoryId === category.id;
  const itemCount = getCategoryItemCount(category.id);
  const isProtected = category.id === 'all';
  const CategoryIcon = getCategoryIcon(category);

  return (
    <div>
      <div
        className={cn(
          'tree-item group',
          isSelected && 'active'
        )}
        style={{ paddingLeft: `${12 + level * 16}px` }}
        onClick={() => onSelect(category.id)}
      >
        <button
          className="w-4 h-4 flex items-center justify-center shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(category.id);
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )
          ) : null}
        </button>
        
        <CategoryIcon className="w-4 h-4 text-muted-foreground shrink-0" />
        
        <span className="flex-1 truncate text-sm">{category.name}</span>
        
        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
          {itemCount}
        </span>

        {!isProtected && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onAddSubcategory(category.id)}>
                <FolderPlus className="w-4 h-4 mr-2" />
                Add Subcategory
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(category)}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onConfigureFields(category)}>
                <Settings2 className="w-4 h-4 mr-2" />
                Configure Fields
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onMoveUp(category.id)}>
                <ArrowUp className="w-4 h-4 mr-2" />
                Move Up
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMoveDown(category.id)}>
                <ArrowDown className="w-4 h-4 mr-2" />
                Move Down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onDelete(category.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {children.map(child => (
            <TreeNode
              key={child.id}
              category={child}
              categories={categories}
              level={level + 1}
              selectedCategoryId={selectedCategoryId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onAddSubcategory={onAddSubcategory}
              onConfigureFields={onConfigureFields}
              getCategoryItemCount={getCategoryItemCount}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const CategoryTree = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onMoveUp,
  onMoveDown,
  getCategoryItemCount,
}: CategoryTreeProps) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['all']));
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [configuringCategory, setConfiguringCategory] = useState<Category | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('folder');
  const [addingToParent, setAddingToParent] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const rootCategories = categories
    .filter(c => c.parentId === null)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      onAddCategory(newCategoryName.trim(), addingToParent, newCategoryIcon);
      setNewCategoryName('');
      setNewCategoryIcon('folder');
      setShowAddDialog(false);
      setAddingToParent(null);
      if (addingToParent) {
        setExpandedIds(prev => new Set([...prev, addingToParent]));
      }
    }
  };

  const handleEditSave = () => {
    if (editingCategory && newCategoryName.trim()) {
      onUpdateCategory(editingCategory.id, { 
        name: newCategoryName.trim(),
        icon: newCategoryIcon,
      });
      setEditingCategory(null);
      setNewCategoryName('');
      setNewCategoryIcon('folder');
    }
  };

  const openAddSubcategory = (parentId: string) => {
    setAddingToParent(parentId);
    setNewCategoryName('');
    setNewCategoryIcon('folder');
    setShowAddDialog(true);
  };

  const openEditDialog = (cat: Category) => {
    setEditingCategory(cat);
    setNewCategoryName(cat.name);
    // Determine current icon
    if (cat.icon) {
      setNewCategoryIcon(cat.icon);
    } else if (cat.emoji && emojiToIconMap[cat.emoji]) {
      setNewCategoryIcon(emojiToIconMap[cat.emoji]);
    } else {
      setNewCategoryIcon('folder');
    }
  };

  return (
    <div className="app-sidebar">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Categories</span>
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6"
          onClick={() => {
            setAddingToParent(null);
            setNewCategoryName('');
            setNewCategoryIcon('folder');
            setShowAddDialog(true);
          }}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {rootCategories.map(category => (
          <TreeNode
            key={category.id}
            category={category}
            categories={categories}
            level={0}
            selectedCategoryId={selectedCategoryId}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            onSelect={onSelectCategory}
            onEdit={openEditDialog}
            onDelete={onDeleteCategory}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onAddSubcategory={openAddSubcategory}
            onConfigureFields={setConfiguringCategory}
            getCategoryItemCount={getCategoryItemCount}
          />
        ))}
      </div>

      {/* Configure Fields Dialog */}
      <CategoryFieldsDialog
        open={!!configuringCategory}
        onOpenChange={(open) => !open && setConfiguringCategory(null)}
        category={configuringCategory}
        onSave={(updates) => {
          if (configuringCategory) {
            onUpdateCategory(configuringCategory.id, updates);
          }
        }}
      />

      {/* Add Category Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {addingToParent ? 'Add Subcategory' : 'Add Category'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex gap-3">
              <IconPicker value={newCategoryIcon} onChange={setNewCategoryIcon} />
              <div className="flex-1 space-y-2">
                <Label htmlFor="category-name">Name</Label>
                <Input
                  id="category-name"
                  placeholder="Category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  autoFocus
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCategory}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex gap-3">
              <IconPicker value={newCategoryIcon} onChange={setNewCategoryIcon} />
              <div className="flex-1 space-y-2">
                <Label htmlFor="edit-category-name">Name</Label>
                <Input
                  id="edit-category-name"
                  placeholder="Category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEditSave()}
                  autoFocus
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCategory(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

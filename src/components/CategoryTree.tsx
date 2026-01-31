import { useState, useCallback } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  Film, 
  Tv, 
  Gamepad2, 
  Music, 
  BookOpen, 
  AppWindow,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  FolderPlus,
} from 'lucide-react';
import { Category } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  folder: Folder,
  film: Film,
  tv: Tv,
  'gamepad-2': Gamepad2,
  music: Music,
  'book-open': BookOpen,
  'app-window': AppWindow,
};

interface CategoryTreeProps {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onAddCategory: (name: string, parentId: string | null) => void;
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
  getCategoryItemCount: (categoryId: string) => number;
}

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
  getCategoryItemCount,
}: TreeNodeProps) => {
  const children = categories
    .filter(c => c.parentId === category.id)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(category.id);
  const isSelected = selectedCategoryId === category.id;
  const Icon = iconMap[category.icon || 'folder'] || Folder;
  const itemCount = getCategoryItemCount(category.id);
  const isProtected = category.id === 'all';

  return (
    <div>
      <div
        className={cn(
          'tree-item group',
          isSelected && 'active'
        )}
        style={{ paddingLeft: `${8 + level * 16}px` }}
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
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )
          ) : null}
        </button>
        
        <Icon className="w-4 h-4 shrink-0" />
        
        <span className="flex-1 truncate text-sm">{category.name}</span>
        
        <span className={cn(
          "text-xs px-1.5 py-0.5 rounded-full shrink-0",
          isSelected 
            ? "bg-primary-foreground/20 text-primary-foreground" 
            : "bg-muted text-muted-foreground"
        )}>
          {itemCount}
        </span>

        {!isProtected && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity",
                  isSelected 
                    ? "hover:bg-primary-foreground/20" 
                    : "hover:bg-muted"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onAddSubcategory(category.id)}>
                <FolderPlus className="w-4 h-4 mr-2" />
                Add Subcategory
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(category)}>
                <Pencil className="w-4 h-4 mr-2" />
                Rename
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
        <div className="animate-fade-in">
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
  const [newCategoryName, setNewCategoryName] = useState('');
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
      onAddCategory(newCategoryName.trim(), addingToParent);
      setNewCategoryName('');
      setShowAddDialog(false);
      setAddingToParent(null);
      if (addingToParent) {
        setExpandedIds(prev => new Set([...prev, addingToParent]));
      }
    }
  };

  const handleEditSave = () => {
    if (editingCategory && newCategoryName.trim()) {
      onUpdateCategory(editingCategory.id, { name: newCategoryName.trim() });
      setEditingCategory(null);
      setNewCategoryName('');
    }
  };

  const openAddSubcategory = (parentId: string) => {
    setAddingToParent(parentId);
    setNewCategoryName('');
    setShowAddDialog(true);
  };

  return (
    <div className="app-sidebar">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">Categories</span>
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6"
          onClick={() => {
            setAddingToParent(null);
            setNewCategoryName('');
            setShowAddDialog(true);
          }}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
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
            onEdit={(cat) => {
              setEditingCategory(cat);
              setNewCategoryName(cat.name);
            }}
            onDelete={onDeleteCategory}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onAddSubcategory={openAddSubcategory}
            getCategoryItemCount={getCategoryItemCount}
          />
        ))}
      </div>

      {/* Add Category Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {addingToParent ? 'Add Subcategory' : 'Add Category'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              autoFocus
            />
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
            <DialogTitle>Rename Category</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEditSave()}
              autoFocus
            />
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

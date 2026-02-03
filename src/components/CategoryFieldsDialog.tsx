import { useState, useEffect } from 'react';
import { Category, CustomFieldDefinition, CustomFieldType, DEFAULT_ENABLED_FIELDS } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
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
import { Plus, Trash2, GripVertical, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CategoryFieldsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  onSave: (updates: Partial<Category>) => void;
}

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Text',
  number: 'Number',
  checkbox: 'Checkbox',
  select: 'Dropdown',
  date: 'Date',
};

const BUILTIN_FIELDS = [
  { key: 'year', label: 'Year' },
  { key: 'rating', label: 'Rating' },
  { key: 'genres', label: 'Genres' },
  { key: 'season', label: 'Season' },
  { key: 'episode', label: 'Episode' },
  { key: 'watched', label: 'Watched' },
  { key: 'path', label: 'Path' },
  { key: 'description', label: 'Description' },
] as const;

export const CategoryFieldsDialog = ({
  open,
  onOpenChange,
  category,
  onSave,
}: CategoryFieldsDialogProps) => {
  const [enabledFields, setEnabledFields] = useState<Category['enabledFields']>({});
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('text');

  useEffect(() => {
    if (category) {
      setEnabledFields(category.enabledFields || DEFAULT_ENABLED_FIELDS);
      setCustomFields(category.customFields || []);
    }
  }, [category, open]);

  const handleToggleBuiltin = (key: string, checked: boolean) => {
    setEnabledFields(prev => ({
      ...prev,
      [key]: checked,
    }));
  };

  const handleAddCustomField = () => {
    if (!newFieldName.trim()) return;
    
    const newField: CustomFieldDefinition = {
      id: `cf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: newFieldName.trim(),
      type: newFieldType,
      options: newFieldType === 'select' ? ['Option 1', 'Option 2'] : undefined,
    };
    
    setCustomFields(prev => [...prev, newField]);
    setNewFieldName('');
    setNewFieldType('text');
  };

  const handleRemoveCustomField = (id: string) => {
    setCustomFields(prev => prev.filter(f => f.id !== id));
  };

  const handleUpdateCustomField = (id: string, updates: Partial<CustomFieldDefinition>) => {
    setCustomFields(prev => 
      prev.map(f => f.id === id ? { ...f, ...updates } : f)
    );
  };

  const handleSave = () => {
    onSave({
      enabledFields,
      customFields,
    });
    onOpenChange(false);
  };

  if (!category) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Configure Fields: {category.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Built-in Fields Section */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Built-in Fields
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {BUILTIN_FIELDS.map(field => (
                <div
                  key={field.key}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <span className="text-sm">{field.label}</span>
                  <Switch
                    checked={enabledFields?.[field.key as keyof typeof enabledFields] ?? true}
                    onCheckedChange={(checked) => handleToggleBuiltin(field.key, checked)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Custom Fields Section */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Custom Fields
            </Label>
            
            {customFields.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No custom fields yet. Add one below.
              </p>
            ) : (
              <div className="space-y-2">
                {customFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex items-center gap-2 p-3 rounded-lg border bg-card"
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 cursor-move" />
                    <Input
                      value={field.name}
                      onChange={(e) => handleUpdateCustomField(field.id, { name: e.target.value })}
                      className="flex-1 h-8"
                      placeholder="Field name"
                    />
                    <Select
                      value={field.type}
                      onValueChange={(value: CustomFieldType) => handleUpdateCustomField(field.id, { type: value })}
                    >
                      <SelectTrigger className="w-28 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
                          <SelectItem key={type} value={type}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1">
                      <Checkbox
                        checked={field.required || false}
                        onCheckedChange={(checked) => handleUpdateCustomField(field.id, { required: checked === true })}
                        title="Required"
                      />
                      <span className="text-xs text-muted-foreground">Req</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveCustomField(field.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new custom field */}
            <div className="flex gap-2 pt-2">
              <Input
                placeholder="New field name"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustomField()}
                className="flex-1"
              />
              <Select
                value={newFieldType}
                onValueChange={(value: CustomFieldType) => setNewFieldType(value)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
                    <SelectItem key={type} value={type}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAddCustomField} disabled={!newFieldName.trim()}>
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
          </div>

          {/* Select Options Editor */}
          {customFields.filter(f => f.type === 'select').length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Dropdown Options
              </Label>
              {customFields.filter(f => f.type === 'select').map(field => (
                <div key={field.id} className="p-3 rounded-lg border bg-card space-y-2">
                  <span className="text-sm font-medium">{field.name}</span>
                  <Input
                    value={field.options?.join(', ') || ''}
                    onChange={(e) => handleUpdateCustomField(field.id, { 
                      options: e.target.value.split(',').map(o => o.trim()).filter(Boolean)
                    })}
                    placeholder="Option 1, Option 2, Option 3"
                    className="h-8"
                  />
                  <p className="text-xs text-muted-foreground">Separate options with commas</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Configuration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

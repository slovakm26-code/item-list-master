import { useState, useMemo } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Category, CustomFieldDefinition } from '@/types';

export interface CustomFieldFilterValue {
  fieldId: string;
  categoryId: string;
  value: string | number | boolean;
  operator?: 'equals' | 'contains' | 'gt' | 'lt';
}

interface CustomFieldFilterProps {
  categories: Category[];
  filters: CustomFieldFilterValue[];
  onFiltersChange: (filters: CustomFieldFilterValue[]) => void;
}

export const CustomFieldFilter = ({
  categories,
  filters,
  onFiltersChange,
}: CustomFieldFilterProps) => {
  const [open, setOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedFieldId, setSelectedFieldId] = useState<string>('');
  const [filterValue, setFilterValue] = useState<string>('');
  const [checkboxValue, setCheckboxValue] = useState(false);

  // Get all categories with custom fields
  const categoriesWithFields = useMemo(() => {
    return categories.filter(c => c.customFields && c.customFields.length > 0);
  }, [categories]);

  // Get fields for selected category
  const selectedCategoryFields = useMemo(() => {
    if (!selectedCategoryId) return [];
    const category = categories.find(c => c.id === selectedCategoryId);
    return category?.customFields || [];
  }, [categories, selectedCategoryId]);

  // Get selected field definition
  const selectedField = useMemo(() => {
    return selectedCategoryFields.find(f => f.id === selectedFieldId);
  }, [selectedCategoryFields, selectedFieldId]);

  const handleAddFilter = () => {
    if (!selectedCategoryId || !selectedFieldId) return;
    
    let value: string | number | boolean = filterValue;
    if (selectedField?.type === 'number') {
      value = parseFloat(filterValue) || 0;
    } else if (selectedField?.type === 'checkbox') {
      value = checkboxValue;
    }

    const newFilter: CustomFieldFilterValue = {
      fieldId: selectedFieldId,
      categoryId: selectedCategoryId,
      value,
      operator: selectedField?.type === 'text' ? 'contains' : 'equals',
    };

    onFiltersChange([...filters, newFilter]);
    
    // Reset form
    setSelectedFieldId('');
    setFilterValue('');
    setCheckboxValue(false);
  };

  const handleRemoveFilter = (index: number) => {
    onFiltersChange(filters.filter((_, i) => i !== index));
  };

  const getFilterLabel = (filter: CustomFieldFilterValue) => {
    const category = categories.find(c => c.id === filter.categoryId);
    const field = category?.customFields?.find(f => f.id === filter.fieldId);
    const fieldName = field?.name || filter.fieldId;
    const displayValue = typeof filter.value === 'boolean' 
      ? (filter.value ? 'Yes' : 'No') 
      : String(filter.value);
    return `${fieldName}: ${displayValue}`;
  };

  return (
    <div className="flex items-center gap-2">
      {filters.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {filters.map((filter, index) => (
            <Badge 
              key={index} 
              variant="secondary" 
              className="gap-1 pr-1"
            >
              {getFilterLabel(filter)}
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={() => handleRemoveFilter(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-1.5 h-8"
          >
            <Filter className="w-4 h-4" />
            Filter
            {filters.length > 0 && (
              <span className="ml-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                {filters.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 bg-popover" align="start">
          <div className="space-y-4">
            <div className="font-medium">Filter by Custom Field</div>
            
            {categoriesWithFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No categories have custom fields defined yet.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select 
                    value={selectedCategoryId} 
                    onValueChange={(v) => {
                      setSelectedCategoryId(v);
                      setSelectedFieldId('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {categoriesWithFields.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.emoji && <span className="mr-1">{cat.emoji}</span>}
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedCategoryId && selectedCategoryFields.length > 0 && (
                  <div className="space-y-2">
                    <Label>Field</Label>
                    <Select 
                      value={selectedFieldId} 
                      onValueChange={setSelectedFieldId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {selectedCategoryFields.map(field => (
                          <SelectItem key={field.id} value={field.id}>
                            {field.name} ({field.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedField && (
                  <div className="space-y-2">
                    <Label>Value</Label>
                    {selectedField.type === 'checkbox' ? (
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          checked={checkboxValue}
                          onCheckedChange={(c) => setCheckboxValue(c === true)}
                        />
                        <span className="text-sm">
                          {checkboxValue ? 'Yes' : 'No'}
                        </span>
                      </div>
                    ) : selectedField.type === 'select' && selectedField.options ? (
                      <Select value={filterValue} onValueChange={setFilterValue}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select value" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover">
                          {selectedField.options.map(opt => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={selectedField.type === 'number' ? 'number' : 'text'}
                        value={filterValue}
                        onChange={(e) => setFilterValue(e.target.value)}
                        placeholder={`Enter ${selectedField.name.toLowerCase()}`}
                      />
                    )}
                  </div>
                )}

                <Button 
                  onClick={handleAddFilter}
                  disabled={!selectedFieldId || (!filterValue && selectedField?.type !== 'checkbox')}
                  size="sm"
                  className="w-full"
                >
                  Add Filter
                </Button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

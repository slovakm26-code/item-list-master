import { Plus, Download, Upload, Database, Moon, Sun, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/hooks/useTheme';

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddItem: () => void;
  onExport: () => void;
  onImport: () => void;
  onBackup: () => void;
  onManageBackups: () => void;
}

export const Toolbar = ({
  searchQuery,
  onSearchChange,
  onAddItem,
  onExport,
  onImport,
  onBackup,
  onManageBackups,
}: ToolbarProps) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="app-toolbar">
      <Button 
        onClick={onAddItem} 
        size="sm" 
        className="gap-1.5 h-8"
      >
        <Plus className="w-4 h-4" />
        Add Item
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 h-8">
            <Database className="w-4 h-4" />
            Database
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={onExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onImport}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onBackup}>
            <Archive className="w-4 h-4 mr-2" />
            Create Backup
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onManageBackups}>
            <Database className="w-4 h-4 mr-2" />
            Manage Backups
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      <div className="relative w-56">
        <Input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      <Button 
        variant="ghost" 
        size="icon" 
        className="w-8 h-8"
        onClick={toggleTheme}
      >
        {theme === 'dark' ? (
          <Sun className="w-4 h-4" />
        ) : (
          <Moon className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
};

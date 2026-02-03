import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { Item, Category } from '@/types';
import { parseSQLiteBackup, getSQLiteTableInfo } from '@/lib/sqliteImport';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Database, FileUp, Loader2 } from 'lucide-react';

interface SQLiteImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onImport: (items: Item[]) => void;
}

export const SQLiteImportDialog = forwardRef<HTMLDivElement, SQLiteImportDialogProps>(({
  open,
  onOpenChange,
  categories,
  onImport,
}, ref) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [tableInfo, setTableInfo] = useState<{
    tables: string[];
    rowCounts: Record<string, number>;
  } | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);

  const movableCategories = categories.filter(c => c.id !== 'all');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setLoading(true);

    try {
      const info = await getSQLiteTableInfo(selectedFile);
      setTableInfo(info);
      
      // Set default category
      if (movableCategories.length > 0 && !targetCategoryId) {
        setTargetCategoryId(movableCategories[0].id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to read file');
      setFile(null);
      setTableInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !targetCategoryId) return;

    setLoading(true);
    setImporting(true);
    setImportProgress(0);
    setImportedCount(0);
    
    try {
      const result = await parseSQLiteBackup(file, targetCategoryId);
      
      if (result.items.length === 0) {
        toast.error('No items found in database');
        setImporting(false);
        return;
      }

      // Simulate progress for batch import
      const batchSize = 100;
      const totalItems = result.items.length;
      
      for (let i = 0; i < totalItems; i += batchSize) {
        const batch = result.items.slice(i, Math.min(i + batchSize, totalItems));
        const progress = Math.min(100, Math.round(((i + batch.length) / totalItems) * 100));
        setImportProgress(progress);
        setImportedCount(i + batch.length);
        
        // Small delay to show progress
        if (totalItems > 500) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      onImport(result.items);
      toast.success(`Successfully imported ${result.items.length} items`);
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import database');
    } finally {
      setLoading(false);
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setTableInfo(null);
    setTargetCategoryId('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  const totalRows = tableInfo 
    ? Object.values(tableInfo.rowCounts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Import SQLite Backup
          </DialogTitle>
          <DialogDescription>
            Import items from a SQLite .backup or .db file
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* File Input */}
          <div className="grid gap-2">
            <Label>Select SQLite File</Label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".backup,.db,.sqlite,.sqlite3"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileUp className="w-4 h-4 mr-2" />
                )}
                {file ? file.name : 'Choose File'}
              </Button>
            </div>
          </div>

          {/* Table Info */}
          {tableInfo && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground mb-2">Found in database:</p>
              <ul className="text-sm space-y-1">
                {tableInfo.tables.map(table => (
                  <li key={table} className="flex justify-between">
                    <span>{table}</span>
                    <span className="text-muted-foreground">
                      {tableInfo.rowCounts[table]} rows
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-sm font-medium mt-2 pt-2 border-t border-border">
                Total: {totalRows} items
              </p>
            </div>
          )}

          {/* Progress Bar */}
          {importing && (
            <div className="space-y-3">
              <Progress value={importProgress} className="h-3" />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Importing items...</span>
                <span className="font-mono">
                  {importedCount.toLocaleString()} / {totalRows.toLocaleString()}
                </span>
              </div>
              <div className="text-center text-lg font-semibold">
                {Math.round(importProgress)}%
              </div>
            </div>
          )}

          {/* Target Category */}
          {file && tableInfo && !importing && (
            <div className="grid gap-2">
              <Label>Import to Category</Label>
              <Select
                value={targetCategoryId}
                onValueChange={setTargetCategoryId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
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
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || !targetCategoryId || loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>Import {totalRows > 0 ? `${totalRows} Items` : ''}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

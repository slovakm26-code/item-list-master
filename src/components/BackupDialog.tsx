import { useState, useEffect } from 'react';
import { Trash2, RotateCcw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getBackups, restoreBackup, deleteBackup } from '@/lib/database';
import { AppState } from '@/types';

interface BackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (state: AppState) => void;
}

export const BackupDialog = ({
  open,
  onOpenChange,
  onRestore,
}: BackupDialogProps) => {
  const [backups, setBackups] = useState<string[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setBackups(getBackups());
    }
  }, [open]);

  const formatBackupName = (key: string) => {
    const timestamp = key.replace('stuff_organizer_backup_', '');
    const parts = timestamp.split('T');
    if (parts.length === 2) {
      return `${parts[0]} ${parts[1].replace(/-/g, ':')}`;
    }
    return timestamp.replace(/-/g, ' ').replace('T', ' ');
  };

  const handleRestore = () => {
    if (selectedBackup) {
      const state = restoreBackup(selectedBackup);
      if (state) {
        onRestore(state);
        onOpenChange(false);
      }
    }
    setConfirmRestore(false);
  };

  const handleDelete = () => {
    if (selectedBackup) {
      deleteBackup(selectedBackup);
      setBackups(getBackups());
      setSelectedBackup(null);
    }
    setConfirmDelete(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Manage Backups</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {backups.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No backups available
              </p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {backups.map((backup) => (
                  <div
                    key={backup}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedBackup === backup 
                        ? 'border-primary bg-accent' 
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedBackup(backup)}
                  >
                    <div>
                      <p className="font-medium text-sm">{formatBackupName(backup)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Automatic backup
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button
              variant="destructive"
              disabled={!selectedBackup}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <Button
              disabled={!selectedBackup}
              onClick={() => setConfirmRestore(true)}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Restore */}
      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current data with the backup. A backup of your current data will be created automatically before restoring.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Delete */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The backup will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

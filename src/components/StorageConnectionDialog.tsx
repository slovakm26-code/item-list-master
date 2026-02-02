import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { HardDrive, FolderOpen, FolderX, Check } from 'lucide-react';
import { toast } from 'sonner';

interface StorageConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSupported: boolean;
  isConnected: boolean;
  directoryName: string | null;
  onConnect: () => Promise<boolean>;
  onDisconnect: () => Promise<void>;
}

export const StorageConnectionDialog = ({
  open,
  onOpenChange,
  isSupported,
  isConnected,
  directoryName,
  onConnect,
  onDisconnect,
}: StorageConnectionDialogProps) => {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const success = await onConnect();
      if (success) {
        toast.success('Storage connected successfully');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to connect storage');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await onDisconnect();
      toast.success('Storage disconnected');
    } catch (error) {
      toast.error('Failed to disconnect storage');
    } finally {
      setLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              Local Storage
            </DialogTitle>
            <DialogDescription>
              Connect to a folder on your computer or USB drive
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
              <p className="font-medium text-destructive mb-2">Not Supported</p>
              <p className="text-muted-foreground">
                Your browser doesn't support the File System Access API. 
                Please use Chrome, Edge, or Opera for this feature.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Local Storage
          </DialogTitle>
          <DialogDescription>
            Connect to a folder on your computer or USB drive to save your data
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Current Status */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Status
            </Label>
            <div className="flex items-center gap-2 mt-2">
              {isConnected ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">Connected</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  <span className="text-sm font-medium">Not Connected</span>
                </>
              )}
            </div>
            {directoryName && (
              <p className="text-sm text-muted-foreground mt-1">
                Folder: {directoryName}
              </p>
            )}
          </div>

          {/* Info */}
          <div className="text-sm text-muted-foreground space-y-2">
            <p>When connected, your data will be saved to:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><code>db.json</code> - Database file</li>
              <li><code>/images/</code> - Cover images</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          {isConnected ? (
            <>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={loading}
              >
                <FolderX className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
              <Button onClick={() => onOpenChange(false)}>
                <Check className="w-4 h-4 mr-2" />
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleConnect} disabled={loading}>
                <FolderOpen className="w-4 h-4 mr-2" />
                Select Folder
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

interface ProgressDialogProps {
  open: boolean;
  title: string;
  description?: string;
  progress: number; // 0-100
  current?: number;
  total?: number;
}

export const ProgressDialog = ({
  open,
  title,
  description,
  progress,
  current,
  total,
}: ProgressDialogProps) => {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-[400px]" hideCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <Progress value={progress} className="h-3" />
          
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{description || 'Processing...'}</span>
            {current !== undefined && total !== undefined && (
              <span className="font-mono">
                {current.toLocaleString()} / {total.toLocaleString()}
              </span>
            )}
          </div>
          
          <div className="text-center text-lg font-semibold">
            {Math.round(progress)}%
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

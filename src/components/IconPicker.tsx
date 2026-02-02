import { useState } from 'react';
import {
  Folder,
  Film,
  Tv,
  Gamepad2,
  Music,
  BookOpen,
  Package,
  Star,
  Heart,
  Bookmark,
  Camera,
  Image,
  FileText,
  Archive,
  Box,
  Briefcase,
  Coffee,
  Compass,
  Database,
  Download,
  Globe,
  Headphones,
  Home,
  Layers,
  Link,
  Monitor,
  Paperclip,
  Pen,
  Play,
  Radio,
  Settings,
  Smartphone,
  Tag,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export interface IconOption {
  name: string;
  icon: LucideIcon;
}

export const availableIcons: IconOption[] = [
  { name: 'folder', icon: Folder },
  { name: 'film', icon: Film },
  { name: 'tv', icon: Tv },
  { name: 'gamepad2', icon: Gamepad2 },
  { name: 'music', icon: Music },
  { name: 'book-open', icon: BookOpen },
  { name: 'package', icon: Package },
  { name: 'star', icon: Star },
  { name: 'heart', icon: Heart },
  { name: 'bookmark', icon: Bookmark },
  { name: 'camera', icon: Camera },
  { name: 'image', icon: Image },
  { name: 'file-text', icon: FileText },
  { name: 'archive', icon: Archive },
  { name: 'box', icon: Box },
  { name: 'briefcase', icon: Briefcase },
  { name: 'coffee', icon: Coffee },
  { name: 'compass', icon: Compass },
  { name: 'database', icon: Database },
  { name: 'download', icon: Download },
  { name: 'globe', icon: Globe },
  { name: 'headphones', icon: Headphones },
  { name: 'home', icon: Home },
  { name: 'layers', icon: Layers },
  { name: 'link', icon: Link },
  { name: 'monitor', icon: Monitor },
  { name: 'paperclip', icon: Paperclip },
  { name: 'pen', icon: Pen },
  { name: 'play', icon: Play },
  { name: 'radio', icon: Radio },
  { name: 'settings', icon: Settings },
  { name: 'smartphone', icon: Smartphone },
  { name: 'tag', icon: Tag },
  { name: 'video', icon: Video },
  { name: 'zap', icon: Zap },
];

export const getIconByName = (name: string): LucideIcon => {
  const found = availableIcons.find(i => i.name === name);
  return found?.icon || Folder;
};

// Map old emoji to new icon names
export const emojiToIconMap: Record<string, string> = {
  '📁': 'folder',
  '🎬': 'film',
  '📺': 'tv',
  '🎮': 'gamepad2',
  '🎵': 'music',
  '📚': 'book-open',
  '💻': 'package',
};

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
}

export const IconPicker = ({ value, onChange }: IconPickerProps) => {
  const [open, setOpen] = useState(false);
  const SelectedIcon = getIconByName(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="w-10 h-10 shrink-0"
        >
          <SelectedIcon className="w-5 h-5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="grid grid-cols-7 gap-1">
          {availableIcons.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={cn(
                "w-8 h-8 flex items-center justify-center rounded-md transition-colors",
                "hover:bg-muted",
                value === name && "bg-accent text-accent-foreground"
              )}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
            >
              <Icon className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

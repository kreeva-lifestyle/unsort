export interface Command {
  id: string;
  label: string;
  category: 'navigate' | 'action' | 'recent';
  icon?: string;
  shortcut?: string;
  action: () => void;
}

import { useMemo } from 'react';
import type { Command } from './types';

export function useCommands(navigate: (tab: string) => void, actions: Record<string, () => void>): Command[] {
  return useMemo(() => [
    { id: 'nav-dashboard', label: 'Dashboard', category: 'navigate', icon: 'grid', action: () => navigate('dashboard') },
    { id: 'nav-inventory', label: 'Inventory', category: 'navigate', icon: 'box', action: () => navigate('inventory') },
    { id: 'nav-brandtag', label: 'Brand Tags', category: 'navigate', icon: 'tag', action: () => navigate('brandtag') },
    { id: 'nav-packtime', label: 'PackStation', category: 'navigate', icon: 'scan', action: () => navigate('packtime') },
    { id: 'nav-challan', label: 'Cash Challan', category: 'navigate', icon: 'file', action: () => navigate('challan') },
    { id: 'nav-programs', label: 'Programs', category: 'navigate', icon: 'box', action: () => navigate('programs') },
    { id: 'nav-settings', label: 'Settings', category: 'navigate', icon: 'settings', action: () => navigate('settings') },
    ...(actions.createChallan ? [{ id: 'act-challan', label: 'Create new challan', category: 'action' as const, icon: 'file', action: actions.createChallan }] : []),
    ...(actions.addInventory ? [{ id: 'act-inventory', label: 'Add inventory item', category: 'action' as const, icon: 'box', action: actions.addInventory }] : []),
    ...(actions.addProgram ? [{ id: 'act-program', label: 'Add new program', category: 'action' as const, icon: 'box', action: actions.addProgram }] : []),
    ...(actions.startScan ? [{ id: 'act-scan', label: 'Start scan session', category: 'action' as const, icon: 'scan', action: actions.startScan }] : []),
  ], [navigate, actions]);
}

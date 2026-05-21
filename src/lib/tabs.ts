export const TAB_IDS = ['dashboard', 'inventory', 'brandtag', 'packtime', 'challan', 'programs', 'minis', 'settings'] as const;
export type TabId = typeof TAB_IDS[number];

const TAB_TO_MODULE: Record<string, string> = {
  inventory: 'inventory', brandtag: 'brandtag', packtime: 'packtime',
  challan: 'challan', programs: 'programs', minis: 'extras',
};

export const MODULE_LABELS: Record<string, string> = {
  inventory: 'Inventory', extras: 'Spare Parts', packtime: 'PackStation',
  brandtag: 'Brand Tags', challan: 'Cash Challan', cashbook: 'Cash Book', programs: 'Programs',
};

export const ALL_MODULE_KEYS = Object.keys(MODULE_LABELS);

export const canAccessTab = (role: string | null | undefined, tab: string, moduleAccess?: Record<string, boolean> | null): boolean => {
  if (!role) return tab === 'dashboard';
  if (tab === 'dashboard' || tab === 'settings') return true;
  if (role === 'admin') return true;
  const modKey = TAB_TO_MODULE[tab];
  if (modKey && moduleAccess && moduleAccess[modKey] === false) return false;
  if (role === 'manager') return true;
  if (role === 'operator') return !['brandtag', 'challan', 'programs', 'minis'].includes(tab);
  return ['dashboard', 'inventory', 'settings'].includes(tab);
};

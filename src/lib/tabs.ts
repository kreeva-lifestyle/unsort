export const TAB_IDS = ['dashboard', 'inventory', 'brandtag', 'packtime', 'challan', 'purchaseorders', 'listingai', 'attendance', 'programs', 'minis', 'printstation', 'settings'] as const;
export type TabId = typeof TAB_IDS[number];

const TAB_TO_MODULE: Record<string, string> = {
  dashboard: 'dashboard', inventory: 'inventory', brandtag: 'brandtag',
  packtime: 'packtime', challan: 'challan', purchaseorders: 'purchaseorders', listingai: 'listingai', attendance: 'attendance', programs: 'programs', minis: 'minis', printstation: 'printstation',
};

export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', inventory: 'Inventory', extras: 'Spare Parts',
  packtime: 'PackStation', brandtag: 'Brand Tags', challan: 'Cash Challan',
  cashbook: 'Cash Book', purchaseorders: 'Purchase Orders', listingai: 'Listing AI', attendance: 'Attendance', programs: 'Programs', minis: 'Minis', printstation: 'Print Station',
};

export const ALL_MODULE_KEYS = Object.keys(MODULE_LABELS);

export const getFirstAllowedTab = (role: string | null | undefined, moduleAccess?: Record<string, boolean> | null): string => {
  for (const t of TAB_IDS) {
    if (t !== 'settings' && canAccessTab(role, t, moduleAccess)) return t;
  }
  return 'settings';
};

export const canAccessTab = (role: string | null | undefined, tab: string, moduleAccess?: Record<string, boolean> | null): boolean => {
  if (!role) return tab === 'dashboard';
  if (tab === 'settings') return true;
  if (role === 'admin') return true;
  const modKey = TAB_TO_MODULE[tab];
  if (modKey && moduleAccess && moduleAccess[modKey] === false) return false;
  if (role === 'manager') return true;
  // Operators are excluded from finance-adjacent modules by default (an admin
  // can still grant access per-user via module_access) — purchase orders carry
  // vendor rates and order values, same sensitivity as the challan book.
  if (role === 'operator') return !['brandtag', 'challan', 'attendance', 'programs', 'minis', 'purchaseorders', 'listingai'].includes(tab);
  return ['dashboard', 'inventory', 'settings'].includes(tab);
};

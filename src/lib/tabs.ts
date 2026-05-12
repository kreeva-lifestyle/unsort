export const TAB_IDS = ['dashboard', 'inventory', 'brandtag', 'packtime', 'challan', 'programs', 'minis', 'settings'] as const;
export type TabId = typeof TAB_IDS[number];

export const canAccessTab = (role: string | null | undefined, tab: string): boolean => {
  if (!role) return tab === 'dashboard';
  if (role === 'admin' || role === 'manager') return true;
  if (role === 'operator') return !['brandtag', 'challan', 'programs', 'minis'].includes(tab);
  return ['dashboard', 'inventory', 'settings'].includes(tab);
};

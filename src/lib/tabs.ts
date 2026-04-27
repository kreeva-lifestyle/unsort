export const TAB_IDS = ['dashboard', 'inventory', 'brandtag', 'packtime', 'challan', 'programs', 'settings'] as const;
export type TabId = typeof TAB_IDS[number];

// Dashboard quick-access shortcuts: the one catalogue of targets a user can
// pin — every module tab plus every Minis tool (from the registry, so a new
// tool is pinnable the day it lands). Permission comes from the same rules
// the sidebar uses; a chip is never offered, or shown, for something the
// user cannot open. Minis tools are reached by handing the hub a pending
// view through sessionStorage, the way the challan deep link already works.
import { TAB_IDS, MODULE_LABELS, canAccessTab } from './tabs';
import { MINI_TILES, MINI_LABELS, type MiniView } from '../components/minis/miniRegistry';

export type ShortcutKind = 'module' | 'mini';
export interface Shortcut { id: string; kind: ShortcutKind; label: string; tab: string; mini?: MiniView }

export const MAX_QUICK_CHIPS = 12;
export const PENDING_MINI_KEY = 'minis_open';

export const SHORTCUTS: Shortcut[] = [
  ...TAB_IDS.filter(t => t !== 'dashboard' && t !== 'settings').map(t => ({ id: `tab:${t}`, kind: 'module' as const, label: MODULE_LABELS[t] || t, tab: t })),
  ...MINI_TILES.map(m => ({ id: `mini:${m.id}`, kind: 'mini' as const, label: MINI_LABELS[m.id] || m.title, tab: 'minis', mini: m.id })),
];
const BY_ID = new Map(SHORTCUTS.map(s => [s.id, s]));

type Who = { role?: string | null; module_access?: Record<string, boolean> | null } | null | undefined;

export const canUseShortcut = (s: Shortcut, who: Who): boolean => canAccessTab(who?.role, s.tab, who?.module_access);

/** The saved ids resolved to shortcuts, dropping unknown ids and anything the user may no longer open. */
export const resolveChips = (ids: unknown, who: Who): Shortcut[] =>
  (Array.isArray(ids) ? ids : []).map(id => BY_ID.get(String(id))).filter((s): s is Shortcut => !!s && canUseShortcut(s, who)).slice(0, MAX_QUICK_CHIPS);

/** Sensible first chips per role, until the user picks their own. */
export const defaultChips = (who: Who): Shortcut[] => {
  const wanted = who?.role === 'operator' ? ['tab:inventory', 'tab:packtime', 'tab:printstation'] : ['tab:inventory', 'tab:challan', 'tab:purchaseorders', 'mini:costing'];
  return resolveChips(wanted, who);
};

export const openShortcut = (s: Shortcut, navigateTo: (tab: string) => void) => {
  if (s.mini) { try { sessionStorage.setItem(PENDING_MINI_KEY, s.mini); } catch { /* private mode */ } }
  navigateTo(s.tab);
};

/** Minis hub: the tool a shortcut asked for, read once and cleared. */
export const takePendingMini = (): MiniView | null => {
  try {
    const v = sessionStorage.getItem(PENDING_MINI_KEY);
    if (!v) return null;
    sessionStorage.removeItem(PENDING_MINI_KEY);
    return v in MINI_LABELS && v !== 'home' ? (v as MiniView) : null;
  } catch { return null; }
};

// Inventory list helpers shared by the page and its rows/cards: the status
// colours (dot + plain label, never a pill in a list), the label text, and
// an item's age — how long it has sat in inventory, amber past two weeks,
// red past a month. Pure.
import { T } from '../../lib/theme';

export const STATUS_DOT_COLOR: Record<string, string> = {
  completed: T.gr,
  complete: T.gr,
  damaged: T.re,
  unsorted: T.yl,
  dry_clean: T.bl,
};

export const statusTag = (status: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '2px 0',
  fontSize: 11,
  fontWeight: 500,
  color: STATUS_DOT_COLOR[status] || STATUS_DOT_COLOR.unsorted,
});

export const statusLabel = (status: string): string => (status === 'dry_clean' ? 'Dry Clean' : status);

/** "12 Oct · 9d" with the colour for how long the item has waited. */
export const ageOf = (createdAt: string | null | undefined): { date: string; days: number; color: string } | null => {
  if (!createdAt) return null;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  return { date: new Date(createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), days, color: days > 30 ? T.re : days > 14 ? T.yl : T.tx3 };
};

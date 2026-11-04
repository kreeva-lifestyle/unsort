// Status labels + colours for products and listings, and the dot + label used everywhere.
import type { CSSProperties, KeyboardEvent } from 'react';
import { T } from '../../../lib/theme';
import type { PbListingStatus, PbProductStatus } from '../../types';

export const PRODUCT_STATUS: Record<PbProductStatus, { label: string; color: string; hint: string }> = {
  new: { label: 'New', color: T.bl, hint: 'Waiting for the AI to read it' },
  reading: { label: 'Reading', color: T.ac2, hint: 'The AI is reading it now' },
  needs_info: { label: 'Needs info', color: T.yl, hint: 'Cost price or category missing' },
  ready: { label: 'Ready', color: T.gr, hint: 'Read and sent to the matching websites' },
  archived: { label: 'Archived', color: T.tx3, hint: 'Hidden from the list' },
};

export const LISTING_STATUS: Record<PbListingStatus, { label: string; color: string }> = {
  queued: { label: 'Queued', color: T.tx3 },
  generating: { label: 'Writing', color: T.ac2 },
  review: { label: 'Needs review', color: T.yl },
  publishing: { label: 'Publishing', color: T.bl },
  published: { label: 'Published', color: T.gr },
  failed: { label: 'Failed', color: T.re },
  skipped: { label: 'Removed', color: T.tx3 },
};

export function Dot({ color, label, style }: { color: string; label?: string; style?: CSSProperties }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.tx2, whiteSpace: 'nowrap', ...style }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

/** ₹ amount with Indian grouping; '—' when empty. */
export const rupees = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Number inputs: block letters (e/E/+/-) — same rule as DailyWork's numericKeyDown. */
export const numKey = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
  if ((e.key >= '0' && e.key <= '9') || e.key === '.') return;
  e.preventDefault();
};

/** "S, M, L" → ['S','M','L'] (trimmed, no empties, no repeats). */
export const splitList = (s: string) => {
  const out: string[] = [];
  for (const p of s.split(',').map(x => x.trim()).filter(Boolean)) if (!out.some(o => o.toLowerCase() === p.toLowerCase())) out.push(p);
  return out;
};

export const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

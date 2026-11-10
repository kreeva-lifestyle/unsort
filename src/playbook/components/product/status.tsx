// Status labels + colours for products and listings, and the dot + label used
// everywhere. Colours follow design/layout-and-components.md §6 (V2 tokens);
// `tint` marks statuses that need action (review / failed tinted tile).
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { PB } from '../../pbTheme';
import type { PbListingStatus, PbProductStatus } from '../../types';

/** Neutral status: a tx3 dot with a tx2 label. */
export const NEUTRAL = PB.tx3;
export type StatusTint = 'review' | 'failed';

export const PRODUCT_STATUS: Record<PbProductStatus, { label: string; color: string; hint: string; tint?: StatusTint }> = {
  new: { label: 'New', color: PB.busy, hint: 'Waiting for the AI to read it' },
  reading: { label: 'Reading', color: PB.busy, hint: 'The AI is reading it now' },
  needs_info: { label: 'Needs info', color: PB.review, hint: 'Cost price or category missing', tint: 'review' },
  ready: { label: 'Ready', color: PB.live, hint: 'Read and sent to the matching websites' },
  archived: { label: 'Archived', color: NEUTRAL, hint: 'Hidden from the list' },
};

export const LISTING_STATUS: Record<PbListingStatus, { label: string; color: string; tint?: StatusTint }> = {
  queued: { label: 'Queued', color: NEUTRAL },
  generating: { label: 'Writing', color: PB.busy },
  review: { label: 'Needs review', color: PB.review, tint: 'review' },
  publishing: { label: 'Publishing', color: PB.busy },
  published: { label: 'Published', color: PB.live },
  failed: { label: 'Failed', color: PB.failed, tint: 'failed' },
  skipped: { label: 'Removed', color: NEUTRAL },
};

/** Status = dot + label, never colour alone. The dot is aria-hidden; the label carries the meaning. */
export function Dot({ color, label, style }: { color: string; label?: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, lineHeight: 1.5, color: PB.tx2, whiteSpace: 'nowrap', ...style }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
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
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

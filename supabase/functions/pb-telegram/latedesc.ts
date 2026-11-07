// A description that came FIRST in the waiting messages with no photos of its
// own (group.ts lateDesc): usually the text of the product made just before it
// from photos alone ("No description arrived" after 60 minutes). If that
// product still has no text, is under 2 days old and is on no website, the text
// goes onto it and it is read again (locked fields stay as typed). Otherwise
// the caller falls back to the usual rule (a priced text is its own product).
import { ago, enc, logActivity, one, patch, sel } from '../pb-products/db.ts';
import type { MsgRow } from './create.ts';
import type { GProduct } from './group.ts';

// 2 days, not 1: channels are checked once a day, so a text posted after
// that night's check arrives about 24 hours after its photos.
const LATE_DESC_MS = 2 * 86_400_000;

export const NO_DESC_NOTE = 'No description arrived from Telegram';
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
interface P { id: string; status: string; raw_text: string | null; intake_notes: string[]; less_amount: number | null }

export async function applyLateDesc(g: GProduct, rows: Map<number, MsgRow>): Promise<'applied' | 'wait' | 'none'> {
  const prev = await one<{ state: string; product_id: string | null }>(
    `pb_tg_messages?origin_chat_id=eq.${g.chat}&origin_message_id=lt.${g.first}&state=neq.ignored&select=state,product_id&order=origin_message_id.desc`);
  if (!prev || prev.state !== 'used' || !prev.product_id) return prev && prev.state === 'pending' ? 'wait' : 'none';
  const p = await one<P>(`pb_products?id=eq.${enc(prev.product_id)}&source=eq.telegram&created_at=gt.${enc(ago(LATE_DESC_MS))}&select=id,status,raw_text,intake_notes,less_amount`);
  if (!p || (p.raw_text || '').trim() || !(p.intake_notes || []).includes(NO_DESC_NOTE) || p.status === 'archived') return 'none';
  if (p.status === 'reading') return 'wait';
  const listings = await sel<{ status: string; shopify_product_id: string | null }>(`pb_listings?product_id=eq.${enc(p.id)}&select=status,shopify_product_id&limit=50`);
  if (listings.some(l => l.status === 'published' || l.status === 'publishing' || !!l.shopify_product_id)) return 'none';
  const less = g.less ?? p.less_amount;
  const raw = [g.description.trim(), less !== null ? `Less: ${fmt(Number(less))}` : ''].filter(Boolean).join('\n');
  const done = await patch('pb_products', `id=eq.${enc(p.id)}&status=eq.${enc(p.status)}`, {
    raw_text: raw.slice(0, 20_000), intake_notes: (p.intake_notes || []).filter(n => n !== NO_DESC_NOTE),
    ...(g.less !== null ? { less_amount: g.less } : {}),
    status: 'new', ai_read_at: null, ai_error: null, claimed_at: null,
  });
  if (!done.length) return 'wait';
  const ids = [...g.desc, ...g.lessIds].filter(id => rows.has(id));
  await patch('pb_tg_messages', `id=in.(${ids.join(',')})&state=in.(pending,failed)`, { state: 'used', product_id: p.id, note: null });
  if (g.extra.length) await patch('pb_tg_messages', `id=in.(${g.extra.join(',')})&state=in.(pending,failed)`, { state: 'ignored', product_id: p.id });
  await logActivity({ product_id: p.id, action: 'telegram_late_description', details: { messages: ids.length } });
  return 'applied';
}

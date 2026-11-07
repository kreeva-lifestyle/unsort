// A "Less" message that arrived after its product was made (the product right
// before it in that channel, with nothing but separators in between).
//   - less_amount is set and "Less: N" added to raw_text;
//   - cost not locked, not on any website yet, product new / needs_info /
//     ready → the cost is cleared and the product is read again, so the reader
//     sets cost = RATE − LESS;
//   - cost locked, already published, or archived → a note asks staff to check
//     the cost.
// A product being read, or with a listing being written / published right now,
// is left for the next run. The product is changed first and the message
// marked after: running twice gives the same result, so a crash in between
// only means the message is looked at again.
import { enc, logActivity, one, patch, sel } from '../pb-products/db.ts';

export type LessOutcome = 'applied' | 'wait' | 'orphan';
interface P { id: string; status: string; locked: string[]; less_amount: number | null; raw_text: string | null; intake_notes: string[]; ai_read_at: string | null; claimed_at: string | null }

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const addNote = (notes: string[], n: string) => (notes.includes(n) ? notes : [...notes, n]);

export async function applyLateLess(x: { chat: number; id: number; mid: number | null; amount: number }): Promise<LessOutcome> {
  if (x.mid === null) return 'orphan';
  const prev = await one<{ state: string; product_id: string | null }>(
    `pb_tg_messages?origin_chat_id=eq.${x.chat}&origin_message_id=lt.${x.mid}&state=neq.ignored&id=neq.${x.id}&select=state,product_id&order=origin_message_id.desc`);
  if (!prev) return 'orphan';
  if (prev.state !== 'used') return prev.state === 'failed' ? 'orphan' : 'wait';
  if (!prev.product_id) return 'orphan';
  const p = await one<P>(`pb_products?id=eq.${enc(prev.product_id)}&select=id,status,locked,less_amount,raw_text,intake_notes,ai_read_at,claimed_at`);
  if (!p) return 'orphan';
  if (p.status === 'reading') return 'wait';
  const claim = () => patch('pb_tg_messages', `id=eq.${x.id}&state=in.(pending,failed)`, { state: 'used', product_id: p.id, note: null });
  if (Number(p.less_amount) === x.amount) { await claim(); return 'applied'; }

  const listings = await sel<{ status: string; shopify_product_id: string | null }>(`pb_listings?product_id=eq.${enc(p.id)}&select=status,shopify_product_id&limit=50`);
  if (listings.some(l => l.status === 'generating' || l.status === 'publishing')) return 'wait';
  const published = listings.some(l => l.status === 'published' || !!l.shopify_product_id);
  const line = `Less: ${fmt(x.amount)}`;
  const set: Record<string, unknown> = { less_amount: x.amount, raw_text: `${(p.raw_text || '').replace(/\n?Less: [\d.,]+\s*$/, '')}\n${line}`.trim() };
  const locked = (p.locked || []).includes('cost_price');
  let reread = false;
  if (locked) set.intake_notes = addNote(p.intake_notes || [], `Less ₹${fmt(x.amount)} arrived after the cost price was typed in — check the cost price.`);
  else if (published) set.intake_notes = addNote(p.intake_notes || [], `Less ₹${fmt(x.amount)} arrived after the product went to a website — check the cost price and the website prices.`);
  else if (['needs_info', 'ready'].includes(p.status) || (p.status === 'new' && p.ai_read_at)) {
    Object.assign(set, { cost_price: null, status: 'new', ai_read_at: null, ai_error: null, claimed_at: null });
    reread = true;
  } else if (p.status !== 'new') set.intake_notes = addNote(p.intake_notes || [], `Less ₹${fmt(x.amount)} arrived later — check the cost price.`);
  // Only if the product did not change meanwhile; otherwise the message waits for the next run.
  const done = await patch('pb_products', `id=eq.${enc(p.id)}&status=eq.${enc(p.status)}`, set);
  if (!done.length) return 'wait';
  await claim();
  await logActivity({ product_id: p.id, action: 'telegram_less', details: { less_amount: x.amount, read_again: reread } });
  return 'applied';
}

// Pure grouping: forwarded Telegram messages → products. No I/O, no Deno APIs
// (unit-tested with `node --test`, see test/group.test.mjs).
//
// Per origin channel, in origin_message_id order:
//   - DESCRIPTION: text / caption of >= 40 characters, or one that names a
//     rate / code / price (₹, INR, Rs 1600, 1600/-).
//   - LESS: a short text such as "200 Less", "200/- less", "Less: Rs 200",
//     "Less - 200.50"; also a short "less 200" line inside a description.
//     A text that also names another number ("Rate 1600 less 200") is a
//     description whose less is read from that line.
//   - anything else short (an emoji, a sticker, "👇", a row of 👉) is a SEPARATOR.
// Three vendor styles:
//   - photos / videos first, then ONE text description (KUMARI_ART): the text
//     closes the product, the next photo starts the next one;
//   - description as the caption of a photo: a photo with a new description
//     caption (outside the current album) starts the next product once the
//     current one already has a description;
//   - description FIRST, then its photos (the next description, or a
//     separator after the photos, starts the next product).
// A separator after a description also closes the product. A LESS attaches to
// the current product until the next product's photos start; one that comes
// first in the waiting messages is a LATE less for the product made before it.
// The last product of a channel is final once its newest message is 3 minutes
// old; one closed by the next product's messages waits until those are 60 s
// old (a delayed album still finds its product). Photos with no description
// become a product after 60 minutes. A description with no photos that comes
// FIRST in the waiting messages is a LATE description (lateDesc) for the
// product made before it; otherwise text with no photos becomes a product only
// when it names a rate / code / price. A channel post forwarded twice counts once.

export type Kind = 'photo' | 'video' | 'text' | 'other';
export interface GMsg { id: number; chat: number; mid: number; kind: Kind; text: string; album: string | null; at: number }
export interface GProduct {
  chat: number; first: number; media: number[]; desc: number[]; description: string;
  less: number | null; lessIds: number[]; extra: number[]; noDescription: boolean;
  /** When its oldest message arrived, and its newest description (null: none). */
  at: number; descAt: number | null;
}
export interface GPlan {
  products: GProduct[]; lateLess: { chat: number; id: number; mid: number; amount: number }[];
  /** Description-only groups first in their channel's batch (see assemble / latedesc.ts). */
  lateDesc: GProduct[]; ignore: number[];
}

export const QUIET_MS = 3 * 60_000;
export const NO_DESC_MS = 60 * 60_000;
export const SETTLE_MS = 60_000;
const DESC_MIN = 40;
const LESS_MAX = 40;
const KEYWORDS = /\b(rate|code|price|inr)\b|₹|\brs\.?\s*\d|\d\s*\/-/i;
const AMT = String.raw`(\d[\d,]*(?:\.\d{1,2})?)(?![\d.,]*\s*%)`;
const LESS_A = new RegExp(String.raw`${AMT}\s*(?:\/-|rs\.?|₹|inr|rupees?)?\s*(?:\/-)?\s*less\b`, 'i');
const LESS_B = new RegExp(String.raw`\bless\b\s*[:\-–=]?\s*(?:rs\.?|₹|inr)?\s*${AMT}`, 'i');
const amountOf = (s: string) => { const n = Number(s.replace(/,/g, '')); return Number.isFinite(n) && n > 0 && n < 10_000_000 ? n : null; };
/** A less phrase in one short line. */
const lessIn = (line: string) => {
  const l = line.trim();
  if (!l || l.length > LESS_MAX) return null;
  const m = LESS_B.exec(l) ?? LESS_A.exec(l);
  const amount = m ? amountOf(m[1]) : null;
  return m && amount !== null ? { amount, match: m[0], rest: l.replace(m[0], '') } : null;
};

/** The amount of a short "Less" message, else null ("Rate 1600 less 200" is a description). */
export function lessOf(text: string): number | null {
  const x = lessIn(text);
  return x && !/\d/.test(x.rest) ? x.amount : null;
}
/** A less written on a short line inside a description ("RATE 1600 LESS 200"). */
export function inlineLess(text: string): number | null {
  for (const l of text.split('\n')) { const x = lessIn(l); if (x) return x.amount; }
  return null;
}
/** The text without its less phrases — what the reader shows the AI, so a less is never taken off twice. */
export function stripLess(text: string): string {
  return text.split('\n').map(l => { const x = lessIn(l); return x ? x.rest.replace(/\s{2,}/g, ' ').trim() : l; })
    .filter((l, i, a) => l.trim() || (i > 0 && a[i - 1].trim())).join('\n').trim();
}

export const hasKeywords = (text: string) => KEYWORDS.test(text);
export const isDescription = (text: string) => { const t = text.trim(); return (t.length >= DESC_MIN && /\p{L}{3}/u.test(t)) || hasKeywords(t); };
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const isMedia = (m: GMsg) => m.kind === 'photo' || m.kind === 'video';

interface Cur {
  media: GMsg[]; desc: GMsg[]; texts: string[]; less: number | null; lessIds: number[]; extra: number[];
  closed: boolean; sepAfterDesc: boolean; lastAt: number; captioned: boolean; descFirst: boolean;
}
const fresh = (at: number): Cur => ({ media: [], desc: [], texts: [], less: null, lessIds: [], extra: [], closed: false, sepAfterDesc: false, lastAt: at, captioned: false, descFirst: false });

function channelPlan(msgs: GMsg[], now: number, out: GPlan, truncated: boolean) {
  let cur: Cur | null = null;
  let groups = 0;
  /** `trigAt`: the message that closed it (the next product's) — the group waits until that is SETTLE_MS old. */
  const emit = (c: Cur, trigAt?: number) => {
    const firstGroup = groups++ === 0;
    if (trigAt !== undefined && now - trigAt < SETTLE_MS) return; // still pending: planned again next run
    const all = [...c.media, ...c.desc];
    const g: GProduct = {
      chat: msgs[0].chat, first: Math.min(...all.map(m => m.mid)), media: c.media.map(m => m.id), desc: c.desc.map(m => m.id),
      description: c.texts.join('\n\n'), less: c.less, lessIds: c.lessIds, extra: c.extra, noDescription: !c.texts.length,
      at: Math.min(...all.map(m => m.at)), descAt: c.desc.length ? Math.max(...c.desc.map(m => m.at)) : null,
    };
    if (!c.media.length && firstGroup && c.texts.length) out.lateDesc.push(g);
    else if (!c.media.length && !hasKeywords(g.description)) out.ignore.push(...g.desc, ...c.lessIds, ...c.extra);
    else out.products.push(g);
  };
  for (const m of msgs) {
    const t = (m.text || '').trim();
    if (cur) cur.lastAt = Math.max(cur.lastAt, m.at);
    if (isMedia(m)) {
      const capLess = t ? lessOf(t) : null;
      const capDesc = t && capLess === null && isDescription(t) ? t : null;
      const last: GMsg | undefined = cur?.media[cur.media.length - 1];
      const sameAlbum = !!m.album && last?.album === m.album;
      const sameText = !!capDesc && !!cur?.texts.some(x => norm(x) === norm(capDesc));
      if (cur && cur.descFirst && !cur.media.length && !cur.sepAfterDesc) cur.closed = false; // its photos, after the description
      else if (!cur || (cur.closed && !sameAlbum) || (capDesc && !sameAlbum && !sameText && (cur.texts.length || cur.captioned))) {
        if (cur) emit(cur, m.at);
        cur = fresh(m.at); cur.captioned = !!t;
      }
      cur.media.push(m);
      if (capDesc && !sameText) {
        cur.desc.push(m); cur.texts.push(capDesc);
        const il = inlineLess(capDesc); if (il !== null && cur.less === null) cur.less = il;
      }
      if (capLess !== null) cur.less = capLess;
      continue;
    }
    const amount = m.kind === 'text' ? lessOf(t) : null;
    if (amount !== null) {
      if (cur) { cur.less = amount; cur.lessIds.push(m.id); } else out.lateLess.push({ chat: m.chat, id: m.id, mid: m.mid, amount });
    } else if (m.kind === 'text' && isDescription(t)) {
      if (cur && (cur.sepAfterDesc || (cur.descFirst && cur.media.length))) { emit(cur, m.at); cur = null; }
      if (!cur) { cur = fresh(m.at); cur.descFirst = true; }
      if (!cur.texts.some(x => norm(x) === norm(t))) { cur.desc.push(m); cur.texts.push(t); } else cur.extra.push(m.id);
      const il = inlineLess(t); if (il !== null && cur.less === null) cur.less = il;
      cur.closed = true;
    } else if (cur) { // separator / sticker / short text
      cur.extra.push(m.id);
      if (cur.texts.length) { cur.closed = true; cur.sepAfterDesc = true; }
    } else out.ignore.push(m.id);
  }
  if (!cur || truncated) return; // the batch ended inside this channel: its last group may be cut
  const age = now - cur.lastAt;
  if (cur.texts.length ? age >= QUIET_MS : cur.media.length > 0 && age >= NO_DESC_MS) emit(cur);
}

/**
 * The products that are complete now, late "Less" / description messages, and
 * the messages to drop. `held`: channels whose waiting messages did not all fit
 * in this batch — their last group is left for the next run.
 */
export function plan(msgs: GMsg[], now: number, held: Set<number> = new Set()): GPlan {
  const out: GPlan = { products: [], lateLess: [], lateDesc: [], ignore: [] };
  const by = new Map<number, GMsg[]>();
  for (const m of msgs) { const l = by.get(m.chat); if (l) l.push(m); else by.set(m.chat, [m]); }
  for (const list of by.values()) {
    list.sort((a, b) => a.mid - b.mid || a.id - b.id);
    const seen = new Set<number>(), uniq: GMsg[] = [];
    for (const m of list) { if (seen.has(m.mid)) out.ignore.push(m.id); else { seen.add(m.mid); uniq.push(m); } } // forwarded twice
    channelPlan(uniq, now, out, held.has(list[0].chat));
  }
  out.products.sort((a, b) => a.at - b.at); // oldest first, whichever channel
  return out;
}

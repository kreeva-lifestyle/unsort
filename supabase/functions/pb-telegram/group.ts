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
// old (a delayed album still finds its product); a description that is still
// waiting for its photos (the last thing seen) waits 20 minutes. Photos with no description
// become a product after 60 minutes. A description with no photos that comes
// FIRST in the waiting messages is a LATE description (lateDesc) for the
// product made before it; otherwise text with no photos becomes a product only
// when it names a rate / code / price. A channel post forwarded twice counts once.
// Pre-launch fixes D15 / D16 (2026-11-13), the text rules being in text.ts:
//   - a short caption with a design number or a price is the description (it
//     was dropped, and the photos became a product with no code or cost);
//   - CHATTER (bank details, a greeting, "call us") never joins a product:
//     as a text it is set aside like a separator; a picture whose caption is
//     a greeting or bank details (a poster) is not a product photo, nor is
//     the rest of its album (a phone number on a caption does not make a
//     picture a poster);
//   - grouping no longer goes by position alone: photos posted 15 minutes or
//     more (the vendor's own clock, `ot`) after the photos before them, in
//     another album, start another product — so a poster or a design posted
//     without any text is not joined to the next design. Without `ot` (not
//     known for that message) the rule does not apply.
// Every message set aside carries why (`why`), for Settings → Telegram.

import { hasKeywords, inlineLess, isCaption, isChatter, isDescription, isPoster, lessOf } from './text.ts';
export { hasKeywords, inlineLess, isChatter, isDescription, lessOf, stripLess } from './text.ts';

export type Kind = 'photo' | 'video' | 'text' | 'other';
/** `at`: when it ARRIVED (ms); `ot`: when the vendor posted it in their channel (ms; null / absent = not known). */
export interface GMsg { id: number; chat: number; mid: number; kind: Kind; text: string; album: string | null; at: number; ot?: number | null }
/** Why a message is not used (shown in Settings → Telegram, "Messages not used"). */
export type SkipWhy = 'separator' | 'repeat' | 'no_photos' | 'chatter';
export interface GProduct {
  chat: number; first: number; media: number[]; desc: number[]; description: string;
  less: number | null; lessIds: number[]; extra: number[]; noDescription: boolean;
  /** When its oldest message arrived, and its newest description (null: none). */
  at: number; descAt: number | null;
  /** When the vendor posted its first message (ms; null: not known). */
  postedAt: number | null;
}
export interface GPlan {
  products: GProduct[]; lateLess: { chat: number; id: number; mid: number; amount: number }[];
  /** Description-only groups first in their channel's batch (see assemble / latedesc.ts). */
  lateDesc: GProduct[]; ignore: number[];
  /** Why, for the ignored ones and for a product's `extra` that is not a plain separator. */
  why: Record<number, SkipWhy>;
}

export const QUIET_MS = 3 * 60_000;
export const DESC_WAIT_MS = 20 * 60_000;
export const NO_DESC_MS = 60 * 60_000;
export const SETTLE_MS = 60_000;
/** Photos this far apart in the vendor's own time, with no album joining them, are two products (D16). */
export const SPLIT_GAP_MS = 15 * 60_000;
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
  let asideAlbum: string | null = null; // an album whose caption was not about a product: its other pictures go with it
  const drop = (ids: number[], why: SkipWhy) => { for (const id of ids) { out.ignore.push(id); out.why[id] ??= why; } };
  /** `trigAt`: the message that closed it (the next product's) — the group waits until that is SETTLE_MS old. */
  const emit = (c: Cur, trigAt?: number) => {
    const firstGroup = groups++ === 0;
    if (trigAt !== undefined && now - trigAt < SETTLE_MS) return; // still pending: planned again next run
    const all = [...c.media, ...c.desc];
    const posted = all.map(m => m.ot).filter((x): x is number => typeof x === 'number');
    const g: GProduct = {
      chat: msgs[0].chat, first: Math.min(...all.map(m => m.mid)), media: c.media.map(m => m.id), desc: c.desc.map(m => m.id),
      description: c.texts.join('\n\n'), less: c.less, lessIds: c.lessIds, extra: c.extra, noDescription: !c.texts.length,
      at: Math.min(...all.map(m => m.at)), descAt: c.desc.length ? Math.max(...c.desc.map(m => m.at)) : null,
      postedAt: posted.length ? Math.min(...posted) : null,
    };
    if (!c.media.length && firstGroup && c.texts.length) out.lateDesc.push(g);
    else if (!c.media.length && !hasKeywords(g.description)) { drop(g.desc, 'no_photos'); drop([...c.lessIds, ...c.extra], 'separator'); }
    else out.products.push(g);
  };
  /** A message that is not part of any product: it also ends the product before it, once that has its description. */
  const aside = (m: GMsg, why: SkipWhy) => {
    if (!cur) { drop([m.id], why); return; }
    cur.extra.push(m.id); out.why[m.id] = why;
    if (cur.texts.length) { cur.closed = true; cur.sepAfterDesc = true; }
  };
  for (const m of msgs) {
    const t = (m.text || '').trim();
    if (cur) cur.lastAt = Math.max(cur.lastAt, m.at);
    if (isMedia(m)) {
      // A picture captioned with a greeting or payment details (a poster), and the rest of its album: not a product photo.
      if ((t && isPoster(t)) || (!!m.album && m.album === asideAlbum)) { asideAlbum = m.album; aside(m, 'chatter'); continue; }
      const capLess = t ? lessOf(t) : null;
      const capDesc = t && capLess === null && isCaption(t) ? t : null;
      const last: GMsg | undefined = cur?.media[cur.media.length - 1];
      const sameAlbum = !!m.album && last?.album === m.album;
      const sameText = !!capDesc && !!cur?.texts.some(x => norm(x) === norm(capDesc));
      // The vendor's own clock: these photos were posted long after the ones before them, outside their album.
      const apart = !!last && !sameAlbum && typeof m.ot === 'number' && typeof last.ot === 'number' && m.ot - last.ot >= SPLIT_GAP_MS;
      if (cur && cur.descFirst && !cur.media.length && !cur.sepAfterDesc) cur.closed = false; // its photos, after the description
      else if (!cur || (cur.closed && !sameAlbum) || apart || (capDesc && !sameAlbum && !sameText && (cur.texts.length || cur.captioned))) {
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
    } else aside(m, m.kind === 'text' && isChatter(t) ? 'chatter' : 'separator'); // a greeting, bank details / a sticker, an arrow, a short text
  }
  if (!cur || truncated) return; // the batch ended inside this channel: its last group may be cut
  const age = now - cur.lastAt;
  // A description still waiting for its photos waits longer: a daily check cut short (a flood wait, a
  // failed read retried minutes later) can pause between a "description first" text and its photos.
  const quiet = cur.descFirst && !cur.media.length ? DESC_WAIT_MS : QUIET_MS;
  if (cur.texts.length ? age >= quiet : cur.media.length > 0 && age >= NO_DESC_MS) emit(cur);
}

/**
 * The products that are complete now, late "Less" / description messages, and
 * the messages to drop. `held`: channels whose waiting messages did not all fit
 * in this batch — their last group is left for the next run.
 */
export function plan(msgs: GMsg[], now: number, held: Set<number> = new Set()): GPlan {
  const out: GPlan = { products: [], lateLess: [], lateDesc: [], ignore: [], why: {} };
  const by = new Map<number, GMsg[]>();
  for (const m of msgs) { const l = by.get(m.chat); if (l) l.push(m); else by.set(m.chat, [m]); }
  for (const list of by.values()) {
    list.sort((a, b) => a.mid - b.mid || a.id - b.id);
    const seen = new Set<number>(), uniq: GMsg[] = [];
    for (const m of list) { if (seen.has(m.mid)) { out.ignore.push(m.id); out.why[m.id] = 'repeat'; } else { seen.add(m.mid); uniq.push(m); } } // forwarded twice
    channelPlan(uniq, now, out, held.has(list[0].chat));
  }
  out.products.sort((a, b) => a.at - b.at); // oldest first, whichever channel
  return out;
}

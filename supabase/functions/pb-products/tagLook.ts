// Pure: the look-alike detector — "we don't want look-alike tags" (owner,
// 2026-11-10). A phrase (a new value staff type, a suggestion, a store tag) is
// compared with EVERY value and "also known as" word of EVERY attribute; each
// value gives its best reason, strongest first:
//   same        the same key                      "black" = "Black"
//   same_word   the same after stemming           "Embroidered" ≈ "Embroidery", "Sequin" ≈ "Sequins"
//   word_order  the same words, another order     "Patti Gota" ≈ "Gota Patti"
//   translation Hindi / Hinglish word list        "Kala" ≈ "Black", "Kadhai" ≈ "Embroidery" (tagDict.ts)
//   shade       a shade of a colour value         "Rani Pink" ≈ "Pink" (shade words + the head word)
//   typo        Damerau–Levenshtein ≤ 1 (≤ 6 letters) / ≤ 2 (longer), 4+ letters
//                                                 "Embroided" ≈ "Embroidery", "Chifon" ≈ "Chiffon"
//   similar     Jaro–Winkler ≥ 0.92                "Organzza" ≈ "Organza"
// `other_attribute` marks a hit in a different attribute than the one the
// phrase is being added to ("Silk" under Work → it is a Fabric value).
// No I/O; tested in test/tagLook.test.mjs.
import { HINDI, SHADE_WORDS } from './tagDict.ts';
import { editDistance, jaroWinkler, stem, stemKey, tagKey } from './tagText.ts';

export interface TaxValue { id: string; attribute_id: string; attribute: string; name: string; key: string; aliases: string[] }
export type LookReason = 'same' | 'same_word' | 'word_order' | 'translation' | 'shade' | 'typo' | 'similar';
export interface LookAlike {
  value_id: string; value: string; attribute_id: string; attribute: string;
  /** the name or "also known as" word that matched */
  via: string; reason: LookReason; score: number; other_attribute: boolean;
}

const SCORE: Record<LookReason, number> = { same: 1, same_word: 0.97, word_order: 0.95, translation: 0.93, shade: 0.9, typo: 0.88, similar: 0.85 };

const sortedWords = (k: string) => k.split(' ').map(stem).sort().join(' ');
const translate = (k: string) => {
  if (HINDI[k]) return HINDI[k];
  const t = k.split(' ').map(w => HINDI[w] ?? w).join(' ');
  return t === k ? '' : t;
};
function shadeHead(k: string): string {
  const w = k.split(' ');
  if (w.length < 2 || !w.slice(0, -1).every(x => SHADE_WORDS.has(x))) return '';
  return stem(w[w.length - 1]);
}

/** Why phrase key `p` looks like target key `t` (null = it does not). */
export function compareKeys(p: string, t: string): { reason: LookReason; score: number } | null {
  if (!p || !t) return null;
  if (p === t) return { reason: 'same', score: SCORE.same };
  const ps = stemKey(p), ts = stemKey(t);
  if (ps === ts) return { reason: 'same_word', score: SCORE.same_word };
  if (p.includes(' ') && sortedWords(p) === sortedWords(t)) return { reason: 'word_order', score: SCORE.word_order };
  const tr = translate(p);
  if (tr && (tr === t || stemKey(tr) === ts)) return { reason: 'translation', score: SCORE.translation };
  const head = shadeHead(p);
  if (head && head === ts) return { reason: 'shade', score: SCORE.shade };
  const len = Math.max(ps.length, ts.length);
  if (Math.min(ps.length, ts.length) >= 4) {
    const d = editDistance(ps, ts);
    if (d <= (len <= 6 ? 1 : 2)) return { reason: 'typo', score: SCORE.typo - d * 0.02 };
    const jw = jaroWinkler(ps, ts);
    if (jw >= 0.92) return { reason: 'similar', score: Math.round(SCORE.similar * jw * 1000) / 1000 };
  }
  return null;
}

/** Values that look like `phrase`, best first (at most `max`). `attributeId` = the attribute it is being
 *  added to (hits elsewhere get other_attribute); `excludeId` = the value being edited. */
export function lookAlikes(phrase: string, values: TaxValue[], o: { attributeId?: string | null; excludeId?: string; max?: number } = {}): LookAlike[] {
  const p = tagKey(phrase);
  if (!p) return [];
  const out: LookAlike[] = [];
  for (const v of values) {
    if (v.id === o.excludeId) continue;
    let best: { reason: LookReason; score: number; via: string } | null = null;
    for (const [via, k] of [[v.name, v.key || tagKey(v.name)], ...v.aliases.map(a => [a, tagKey(a)])]) {
      const hit = compareKeys(p, k);
      if (hit && (!best || hit.score > best.score)) best = { ...hit, via };
    }
    if (best) out.push({ value_id: v.id, value: v.name, attribute_id: v.attribute_id, attribute: v.attribute, via: best.via, reason: best.reason, score: best.score, other_attribute: !!o.attributeId && v.attribute_id !== o.attributeId });
  }
  // same attribute first on a tie, then the stronger reason
  return out.sort((a, b) => b.score - a.score || Number(a.other_attribute) - Number(b.other_attribute) || a.value.localeCompare(b.value)).slice(0, o.max ?? 5);
}

/** The phrase is ALREADY a value or "also known as" word of that attribute (not a look-alike, the thing itself). */
export const exactIn = (phrase: string, values: TaxValue[], attributeId: string) => {
  const k = tagKey(phrase);
  return values.find(v => v.attribute_id === attributeId && (v.key === k || v.aliases.some(a => tagKey(a) === k))) ?? null;
};

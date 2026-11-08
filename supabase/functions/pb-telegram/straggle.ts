// Pure (unit-tested in test/straggle.test.mjs): waiting messages checked
// against the messages of the same channel already used for products.
//   - dupes: the same channel post again (the crawler forwarded it twice and
//     the first copy is already in a product) → dropped;
//   - adopt: a photo / video that arrived after its product was made — its
//     album's other parts are in a product, or the used messages right before
//     and after it belong to one product → it is added to that product.
export interface Waiting { id: number; mid: number; kind: string; album: string | null }
export interface Used { mid: number; album: string | null; product_id: string }

export function stragglers(waiting: Waiting[], used: Used[]): { dupes: number[]; adopt: Map<number, string> } {
  const dupes: number[] = [];
  const adopt = new Map<number, string>();
  if (!used.length) return { dupes, adopt };
  const sorted = [...used].sort((a, b) => a.mid - b.mid);
  const mids = new Set(sorted.map(u => u.mid));
  const byAlbum = new Map<string, string>();
  for (const u of sorted) if (u.album) byAlbum.set(u.album, u.product_id);
  for (const w of waiting) {
    if (mids.has(w.mid)) { dupes.push(w.id); continue; }
    if (w.kind !== 'photo' && w.kind !== 'video') continue;
    const viaAlbum = w.album ? byAlbum.get(w.album) : undefined;
    if (viaAlbum) { adopt.set(w.id, viaAlbum); continue; }
    let below: Used | undefined, above: Used | undefined;
    for (const u of sorted) { if (u.mid < w.mid) below = u; else { above = u; break; } }
    if (below && above && below.product_id === above.product_id) adopt.set(w.id, below.product_id);
  }
  return { dupes, adopt };
}

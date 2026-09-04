// Evidence that lives inside the costing data itself: labour lines the
// sheet already carries that a Settings stitching head counts again,
// placeholder ₹1 rates, and how this product's cost structure sits against
// its peers. Pure; called by buildEvidence.
import { money } from '../costing/costingModel';
import { costBreakdown } from './pricingModel';
import type { Evidence, EvidenceInput, SheetLine } from './evidence';
import { r2 } from './evidence';
import { norm } from './normName';

type Item = Omit<Evidence, 'id'>;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const PEER_GAP_POINTS = 10;

export function sheetEvidence(inp: EvidenceInput, lines: SheetLine[]): Item[] {
  const { product: p, projection: pr, peers, config } = inp;
  const out: Item[] = [];

  // A head in Settings AND a matching line on the sheet = the same labour
  // charged twice. Name match is by normalised containment either way
  // ("STITCHING" ⊂ "stitching charges"), never shorter than 4 characters.
  for (const l of pr.breakdown.stitching) {
    if (!l.enabled || l.cost <= 0) continue;
    const h = norm(l.head.name);
    if (h.length < 4) continue;
    const dup = lines.filter(x => x.cost > 0 && x.nameN.length >= 4 && (x.nameN.includes(h) || h.includes(x.nameN)));
    if (!dup.length) continue;
    const onSheet = r2(dup.reduce((t, x) => t + x.cost, 0));
    out.push({
      kind: 'double_count', title: `${l.head.name} is counted twice`,
      detail: `The sheet already carries ${dup.map(x => `${x.name} ${money(x.cost)} (${x.comp}, ${x.supplier})`).join(', ')} = ${money(onSheet)}, and the Settings head "${l.head.name}" adds ${money(l.cost)} on top. Keep one: exclude the head for this product, or delete the sheet line if the head is the true rate.`,
      impactPerPc: l.cost, pos: [], action: { type: 'exclude_head', headId: l.head.id, label: `Exclude ${l.head.name}` },
    });
  }

  // ₹1 is how sheets are parked before the real rate is known.
  const ph = lines.filter(x => x.rate > 0 && x.rate <= 1);
  if (ph.length) {
    out.push({ kind: 'placeholder_rates', title: `${ph.length} line${ph.length > 1 ? 's' : ''} costed at ₹1`, detail: `${ph.map(x => `${x.name} (${x.comp})`).join(', ')} ${ph.length > 1 ? 'are' : 'is'} priced at the ₹1 placeholder, so the cost per piece is understated by whatever those really cost. Margin and threshold status are not trustworthy until the real rates are entered on the costing sheet.`, impactPerPc: null, pos: [] });
  }

  // Cost structure against peers: same category when at least two share
  // it, otherwise every other sheet (categories are still being filled in).
  const cat = (p.category || '').trim().toUpperCase();
  const others = peers.filter(x => x.id !== p.id);
  const sameCat = cat ? others.filter(x => (x.category || '').trim().toUpperCase() === cat) : [];
  const group = sameCat.length >= 2 ? sameCat : others;
  const label = sameCat.length >= 2 ? `${cat} sheets` : 'all costing sheets';
  if (group.length >= 2) {
    const shares = (b: ReturnType<typeof costBreakdown>) => b.costPerPc > 0 ? { Fabric: b.fabric / b.costPerPc * 100, Material: b.material / b.costPerPc * 100, Stitching: b.stitchingTotal / b.costPerPc * 100, Maintenance: b.maintenance / b.costPerPc * 100 } : null;
    const peerShares = group.map(x => shares(costBreakdown(x, config))).filter((s): s is NonNullable<typeof s> => !!s);
    const mine = shares(pr.breakdown);
    if (mine && peerShares.length >= 2) {
      const peerCost = median(group.map(x => costBreakdown(x, config).costPerPc));
      let flagged = 0;
      for (const k of Object.keys(mine) as (keyof typeof mine)[]) {
        const med = median(peerShares.map(s => s[k]));
        const gap = mine[k] - med;
        if (gap <= PEER_GAP_POINTS || flagged >= 2) continue;
        flagged += 1;
        const rupees = r2(gap / 100 * pr.breakdown.costPerPc);
        out.push({ kind: 'peer_structure', title: `${k} is ${mine[k].toFixed(0)}% of cost; ${label} sit at ${med.toFixed(0)}%`, detail: `Across ${group.length} ${label} the median ${k.toLowerCase()} share is ${med.toFixed(0)}%; this sheet's is ${mine[k].toFixed(0)}%, ${rupees ? `${money(rupees)} per piece more than the peer structure at this cost` : 'the same in rupees'}. Median cost per piece of the peers is ${money(peerCost)} against ${money(pr.breakdown.costPerPc)} here.`, impactPerPc: rupees > 0 ? rupees : null, pos: [] });
      }
      if (!flagged) out.push({ kind: 'peer_structure', title: `Structure in line with ${group.length} ${label}`, detail: `Fabric ${mine.Fabric.toFixed(0)}%, material ${mine.Material.toFixed(0)}%, stitching ${mine.Stitching.toFixed(0)}%, maintenance ${mine.Maintenance.toFixed(0)}% of cost — none more than ${PEER_GAP_POINTS} points above the peer median. Cost per piece ${money(pr.breakdown.costPerPc)} against a peer median of ${money(peerCost)}.`, impactPerPc: null, pos: [] });
    }
  }
  return out;
}

/** Text for the empty state: which data would unlock peer comparison. */
export const peerMissing = (p: { category?: string | null }, peers: { id: string }[]): string | null =>
  peers.length <= 2 ? 'Fewer than two other costing sheets exist, so there is no peer structure to compare against.' : (p.category ? null : 'This sheet has no category; peers are all sheets until one is set.');

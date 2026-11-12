// What the AI cost for one product so far, in rupees (owner, 2026-11-12: "ai
// costing … in Indian rupees combined of all websites"): reading the post,
// choosing tags, and writing for every website (rewrites and Regenerate
// included). Dollars are recorded as spent; rupees use the fixed rate in format.ts.
import { aiRupees } from '../../../format';
import { PB, pbMeta, pbNum } from '../../../pbTheme';
import type { PbAiCost } from '../../../seoTypes';

export default function AiCostLine({ cost }: { cost: PbAiCost | null }) {
  if (!cost) return null;
  const total = cost.read_usd + cost.tag_usd + cost.write_usd;
  if (!(total > 0)) return null;
  const parts: [string, number][] = [['reading', cost.read_usd], ['tags', cost.tag_usd], [cost.writes > 1 ? `writing (${cost.writes} times)` : 'writing', cost.write_usd]];
  const num = { ...pbNum, color: PB.tx } as const;
  return (
    <div style={{ ...pbMeta, padding: '0 4px', overflowWrap: 'anywhere' }}>
      AI cost for this product so far <span style={{ ...num, fontWeight: 600 }}>{aiRupees(total)}</span>
      {parts.filter(([, v]) => v > 0).map(([label, v]) => <span key={label}> · {label} <span style={num}>{aiRupees(v)}</span></span>)}
    </div>
  );
}

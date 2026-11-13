// The nearest value already in the lists for one suggestion (owner, 2026-11-13: "AI suggestion needed which suggest
// us to select existing which is the nearest match"): found by the word rules or the AI (pb-products tagNearest.ts),
// with one tap to file the phrase under it. "Same as Art Silk" makes the phrase an "also known as" word of that
// value, as "Also known as…" does after choosing one. A pick is a note to act on: the review tint without blur
// (layout §5, as the required-but-missing line); "none close" sits on the plain control fill.
import type { PbNearest } from '../../tagTypes';
import { PB, pbLabel, pbMeta } from '../../pbTheme';
import { PbButton } from '../ui';
import { Dot } from '../product/status';
import { WRAP } from './tagText';

export default function NearestBox({ near, asking, canEdit, busy, dim, onUse }: {
  near: PbNearest | null; asking: boolean; canEdit: boolean; busy: boolean; dim: boolean; onUse: () => void;
}) {
  if (!near && !asking) return null;
  const pick = !!near?.value_id;
  return (
    <div style={{
      width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: PB.r.input, display: 'flex', flexDirection: 'column', gap: 8,
      background: pick ? PB.reviewBg : PB.ctl, border: `1px solid ${pick ? PB.reviewBd : PB.ctlBd}`,
    }}>
      <span style={{ ...pbLabel, marginBottom: 0 }}>Nearest match</span>
      {!near && <span aria-live="polite" style={pbMeta}>The AI is looking for the closest value in your lists…</span>}
      {near && pick && (
        <>
          <Dot color={PB.review} style={{ whiteSpace: 'normal', fontSize: 14, color: PB.tx2, overflowWrap: 'anywhere' }}
            label={<span><span style={{ color: PB.tx, fontWeight: 600 }}>{near.value}</span> · {near.attribute}</span>} />
          {near.why && <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>{near.by === 'ai' ? 'The AI: ' : ''}{near.why}</span>}
          {canEdit && (
            <PbButton icon="merge" style={{ ...WRAP, width: '100%' }} onClick={onUse} busy={busy} busyLabel="Filing…" dim={dim}>
              Same as {near.value}
            </PbButton>
          )}
        </>
      )}
      {near && !pick && (
        <>
          <Dot color={PB.tx3} label="No close value in your lists" style={{ whiteSpace: 'normal', fontSize: 14, color: PB.tx }} />
          {near.why && <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>The AI: {near.why}</span>}
        </>
      )}
    </div>
  );
}

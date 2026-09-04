// AI insights card — the "cost intelligence" panel under the rule-based
// list. Top half: the evidence engine's items with their actions. Bottom
// half: the saved AI batch, every insight citing the evidence ids it was
// built from. One saved batch per product; Generate replaces it. The input
// fingerprint (facts + evidence) tells us when a regenerate is due.
import { useEffect, useState } from 'react';
import { T, S, Icon, alpha } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { money } from '../costing/costingModel';
import { AiBatch, AiSuggestion, loadAiBatch, generateAiBatch, usd } from './aiSuggestions';
import type { EvidenceAction, EvidenceResult } from './evidence';
import EvidenceList, { RefChip } from './EvidenceList';

const IMPACT: Record<AiSuggestion['impact'], string> = { high: T.gr, medium: T.yl, low: T.tx3 };
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AiSuggestionsCard({ productId, hash, facts, evidence, deterministic, addToast, actionBusy, onAction }: {
  productId: string; hash: string | null; facts: unknown; evidence: EvidenceResult; deterministic: { title: string; detail: string }[];
  addToast: (m: string, t?: string) => void; actionBusy: string | null; onAction: (a: EvidenceAction) => void;
}) {
  const [batch, setBatch] = useState<AiBatch | null | undefined>(undefined);   // undefined = loading
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    loadAiBatch(productId).then(({ batch: b, error }) => { if (!alive) return; if (error) addToast('Could not load AI insights — ' + friendlyError(error), 'error'); setBatch(b); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const stale = !!batch && !!hash && batch.input_hash !== hash;
  const canGenerate = !!hash && evidence.items.length > 0;
  const generate = async () => {
    if (busy || !canGenerate) return;
    setBusy(true);
    const { batch: b, error } = await generateAiBatch(productId, hash!, facts, evidence.items, deterministic);
    setBusy(false);
    if (error || !b) { addToast(error || 'AI insights failed', 'error'); return; }
    setBatch(b); addToast(`AI insights saved — this generation cost ${usd(b.est_usd)}`, 'success');
  };

  const frame: React.CSSProperties = {
    position: 'relative', borderRadius: 14, padding: 1, marginBottom: 12,
    background: `linear-gradient(135deg, ${alpha(T.ac, 0.9)}, ${alpha(T.bl, 0.7)} 50%, ${alpha(T.gr, 0.7)})`,
    boxShadow: `0 0 28px ${alpha(T.ac, 0.22)}, inset 0 0 0 1px ${alpha(T.ac, 0.15)}`,
  };
  const inner: React.CSSProperties = { borderRadius: 13, background: `linear-gradient(180deg, ${T.s2}, ${T.s})`, padding: 14 };
  const label = busy ? 'Thinking…' : batch ? (stale ? 'Regenerate' : 'Generate again') : 'Generate insights';
  // Evidence ids are resolved against the batch's own frozen copy first,
  // then the live list, so a chip always has a title to show.
  const titleOf = (id: string) => (batch?.evidence || []).find(e => e.id === id)?.title || evidence.items.find(e => e.id === id)?.title || '';

  return (
    <div style={frame}>
      <div style={inner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: `linear-gradient(135deg, ${T.ac}, ${T.bl})`, color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', fontFamily: T.mono }}>
            <Icon name="sparkles" size={11} /> AI
          </span>
          <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.tx3, fontFamily: T.mono }}>Cost intelligence</span>
          <button type="button" onClick={generate} disabled={busy || !canGenerate} className="touch44"
            style={{ marginLeft: 'auto', ...S.btnPrimary, minHeight: 36, background: `linear-gradient(135deg, ${T.ac}, ${T.bl})`, border: 'none', pointerEvents: busy ? 'none' : 'auto', opacity: busy || !canGenerate ? 0.6 : 1, boxShadow: `0 0 18px ${alpha(T.ac, 0.4)}` }}>
            {label}
          </button>
        </div>

        <EvidenceList evidence={evidence} busy={actionBusy} onAction={onAction} />

        <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.tx3, fontFamily: T.mono, marginBottom: 4, borderTop: `1px solid ${T.bd2}`, paddingTop: 10 }}>AI insights</div>
        {busy && <div className="ai-shimmer" style={{ height: 6, borderRadius: 3, marginBottom: 10 }} />}
        {stale && !busy && (
          <div style={{ fontSize: 11, color: T.yl, background: alpha(T.yl, 0.08), border: `1px solid ${alpha(T.yl, 0.3)}`, borderRadius: 8, padding: '7px 10px', marginBottom: 10 }}>
            The costs, price or evidence changed since these were generated — tap Regenerate for insights that match the current data.
          </div>
        )}
        {batch === undefined && <div style={{ fontSize: 11, color: T.tx3 }}>Loading…</div>}
        {batch === null && !busy && (
          <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.6 }}>
            {canGenerate
              ? 'No AI insights yet. Generate reads only the evidence above — purchase orders, the sheet, the stitching heads and the peer sheets — and writes up what the numbers show, each insight citing the evidence it came from. No negotiation or bundling advice. Insights are saved with this product; generating again replaces them.'
              : 'There is no evidence to reason over yet, so Generate stays off — add the data listed above and it switches on.'}
          </div>
        )}
        {batch && batch.suggestions.length === 0 && <div style={{ fontSize: 11, color: T.tx2 }}>The evidence did not support any insight beyond what is listed above.</div>}
        {batch && batch.suggestions.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: i ? `1px solid ${T.bd}` : 'none', opacity: stale ? 0.7 : 1 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: IMPACT[s.impact], boxShadow: `0 0 8px ${IMPACT[s.impact]}` }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{s.title}</span>
                {s.savingPerPc ? <span style={{ fontFamily: T.mono, fontSize: 11, color: T.gr, flexShrink: 0 }}>−{money(s.savingPerPc)}/pc</span> : null}
              </div>
              <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5, marginTop: 2 }}>{s.detail}</div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', marginTop: 5 }}>
                {s.refs.map(r => <span key={r} title={titleOf(r)}><RefChip id={r} dim={stale} /></span>)}
                <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.area} · {s.impact} impact</span>
              </div>
            </div>
          </div>
        ))}
        {batch?.note && <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.5, marginTop: 8, fontStyle: 'italic' }}>{batch.note}</div>}
        {batch && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: 9, color: T.tx3, fontFamily: T.mono, letterSpacing: '0.06em' }}>
            <span>Generated {when(batch.created_at)} · {batch.model} · saved with this product</span>
            <span style={{ color: T.ac2 }} title={batch.usage ? `${batch.usage.input_tokens.toLocaleString('en-IN')} in · ${batch.usage.output_tokens.toLocaleString('en-IN')} out tokens` : undefined}>
              cost {usd(batch.est_usd)}{batch.usage ? ` · ${batch.usage.input_tokens.toLocaleString('en-IN')} in / ${batch.usage.output_tokens.toLocaleString('en-IN')} out` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

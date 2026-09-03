// AI-powered suggestions card — the "cost intelligence" panel under the
// rule-based list. One saved batch per product; Generate replaces it. The
// input fingerprint tells us when the sheet moved on and a regenerate is due.
import { useEffect, useState } from 'react';
import { T, S, Icon, alpha } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { money } from '../costing/costingModel';
import { AiBatch, AiSuggestion, loadAiBatch, generateAiBatch, usd } from './aiSuggestions';

const IMPACT: Record<AiSuggestion['impact'], string> = { high: T.gr, medium: T.yl, low: T.tx3 };
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AiSuggestionsCard({ productId, hash, facts, deterministic, addToast }: {
  productId: string; hash: string | null; facts: unknown; deterministic: { title: string; detail: string }[]; addToast: (m: string, t?: string) => void;
}) {
  const [batch, setBatch] = useState<AiBatch | null | undefined>(undefined);   // undefined = loading
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    loadAiBatch(productId).then(({ batch: b, error }) => { if (!alive) return; if (error) addToast('Could not load AI suggestions — ' + friendlyError(error), 'error'); setBatch(b); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const stale = !!batch && !!hash && batch.input_hash !== hash;
  const generate = async () => {
    if (busy || !hash) return;
    setBusy(true);
    const { batch: b, error } = await generateAiBatch(productId, hash, facts, deterministic);
    setBusy(false);
    if (error || !b) { addToast(error || 'AI suggestions failed', 'error'); return; }
    setBatch(b); addToast(`AI suggestions saved — this generation cost ${usd(b.est_usd)}`, 'success');
  };

  const frame: React.CSSProperties = {
    position: 'relative', borderRadius: 14, padding: 1, marginBottom: 12,
    background: `linear-gradient(135deg, ${alpha(T.ac, 0.9)}, ${alpha(T.bl, 0.7)} 50%, ${alpha(T.gr, 0.7)})`,
    boxShadow: `0 0 28px ${alpha(T.ac, 0.22)}, inset 0 0 0 1px ${alpha(T.ac, 0.15)}`,
  };
  const inner: React.CSSProperties = { borderRadius: 13, background: `linear-gradient(180deg, ${T.s2}, ${T.s})`, padding: 14 };
  const label = busy ? 'Thinking…' : batch ? (stale ? 'Regenerate' : 'Generate again') : 'Generate with AI';

  return (
    <div style={frame}>
      <div style={inner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: `linear-gradient(135deg, ${T.ac}, ${T.bl})`, color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', fontFamily: T.mono }}>
            <Icon name="sparkles" size={11} /> AI
          </span>
          <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.tx3, fontFamily: T.mono }}>Cost intelligence</span>
          <button type="button" onClick={generate} disabled={busy || !hash} className="touch44"
            style={{ marginLeft: 'auto', ...S.btnPrimary, minHeight: 36, background: `linear-gradient(135deg, ${T.ac}, ${T.bl})`, border: 'none', pointerEvents: busy ? 'none' : 'auto', opacity: busy || !hash ? 0.6 : 1, boxShadow: `0 0 18px ${alpha(T.ac, 0.4)}` }}>
            {label}
          </button>
        </div>

        {busy && <div className="ai-shimmer" style={{ height: 6, borderRadius: 3, marginBottom: 10 }} />}
        {stale && !busy && (
          <div style={{ fontSize: 11, color: T.yl, background: alpha(T.yl, 0.08), border: `1px solid ${alpha(T.yl, 0.3)}`, borderRadius: 8, padding: '7px 10px', marginBottom: 10 }}>
            The costs or price changed since these were generated — tap Regenerate for suggestions that match the current numbers.
          </div>
        )}
        {batch === undefined && <div style={{ fontSize: 11, color: T.tx3 }}>Loading…</div>}
        {batch === null && !busy && (
          <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.6 }}>
            No AI suggestions yet. Generate reads this product's exact cost stack, price and margin, and proposes ideas beyond the rule-based list — fabric utilisation, construction, trims, batch sizes, price positioning. Suggestions are saved with this product; generating again replaces them.
          </div>
        )}
        {batch && batch.suggestions.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: i ? `1px solid ${T.bd}` : 'none', opacity: stale ? 0.7 : 1 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: IMPACT[s.impact], boxShadow: `0 0 8px ${IMPACT[s.impact]}` }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{s.title}</span>
                {s.savingPerPc ? <span style={{ fontFamily: T.mono, fontSize: 11, color: T.gr, flexShrink: 0 }}>−{money(s.savingPerPc)}/pc</span> : null}
              </div>
              <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5, marginTop: 2 }}>{s.detail}</div>
              <div style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>{s.area} · {s.impact} impact</div>
            </div>
          </div>
        ))}
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

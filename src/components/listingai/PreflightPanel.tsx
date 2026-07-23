// Pre-AI check results: shown between the input card and results when the
// free validate call finds SKUs that are missing from the master sheet or
// look like a different garment category than the selected template. The
// owner decides — remove the bad ones, run anyway (detection is heuristic),
// or cancel. Nothing has cost AI tokens yet at this point.
import { T, S } from '../../lib/theme';
import type { PreflightIssues } from './preflight';

export default function PreflightPanel({ issues, generating, onConfirm }: {
  issues: PreflightIssues;
  generating: boolean;
  onConfirm: (mode: 'clean' | 'force' | 'cancel') => void;
}) {
  const bad = issues.notInMaster.length + issues.mismatched.length;
  const total = bad + issues.clean.length;
  const busy = { pointerEvents: generating ? 'none' as const : 'auto' as const, opacity: generating ? 0.5 : 1 };
  return (
    <div style={{ background: 'oklch(0.78 0.18 75 / .06)', border: '1px solid oklch(0.78 0.18 75 / .2)', borderRadius: 10, padding: '12px 14px', marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.yl, fontFamily: T.sora, marginBottom: 4 }}>
        Check before spending — {bad} of {total} SKU{total === 1 ? '' : 's'} look{bad === 1 ? 's' : ''} wrong for this template
      </div>
      <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5, marginBottom: 8 }}>
        Nothing has been generated yet — no AI cost so far.
        {issues.tplLabel ? <> This template reads as <b>{issues.tplLabel}</b>.</> : null}
      </div>
      {issues.notInMaster.length > 0 && (
        <div style={{ fontSize: 11, color: T.tx2, marginBottom: 6 }}>
          <span style={{ color: T.tx3 }}>Not in the master sheet:</span>{' '}
          <span style={{ fontFamily: T.mono }}>{issues.notInMaster.join(', ')}</span>
        </div>
      )}
      {issues.mismatched.length > 0 && (
        <div style={{ fontSize: 11, color: T.tx2, marginBottom: 6 }}>
          {issues.mismatched.map(m => (
            <div key={m.sku} style={{ marginBottom: 2 }}>
              <span style={{ fontFamily: T.mono, fontWeight: 600 }}>{m.sku}</span>
              {' — looks like '}<b>{m.detectedLabel}</b>{issues.tplLabel ? <> (template: {issues.tplLabel})</> : null}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {issues.clean.length > 0 && (
          <button onClick={() => onConfirm('clean')} style={{ ...S.btnPrimary, minHeight: 44, ...busy }}>
            Remove {bad} bad &amp; run {issues.clean.length}
          </button>
        )}
        <button onClick={() => onConfirm('force')} style={{ ...S.btnGhost, minHeight: 44, ...busy }}>Run anyway</button>
        <button onClick={() => onConfirm('cancel')} style={{ ...S.btnGhost, minHeight: 44, ...busy }}>Cancel</button>
      </div>
    </div>
  );
}

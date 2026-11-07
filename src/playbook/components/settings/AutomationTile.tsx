// Settings → the automation status tile (desktop 4 wide beside the form;
// phone after it): the on/off switch row, what that means right now, "Run
// now" (the page's one gradient) and the last run's counts. Paused is a
// lasting page-wide state, so the tile takes the review tint.
import PbSwitch from '../ui/PbSwitch';
import { PB, pbBody, pbLabel, pbMeta, pbName, pbNum, pbTileTitle } from '../../pbTheme';
import type { WorkResult } from '../../data/settings';
import { Dot } from '../product/status';
import { PbButton, PbTile } from '../ui';

export default function AutomationTile({ paused, saving, running, dim, run, onToggle, onRun }: {
  paused: boolean; saving: boolean; running: boolean; dim: boolean; run: WorkResult | null; onToggle: () => void; onRun: () => void;
}) {
  const counts = run ? ([['Read', run.read, PB.busy], ['Routed', run.routed, PB.busy], ['Written', run.generated, PB.busy], ['Published', run.published, PB.live], ['Failed', run.failed, PB.failed]] as const) : [];
  return (
    <PbTile as="section" variant={paused ? 'review' : 'default'} aria-labelledby="pbs-auto" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 id="pbs-auto" style={pbTileTitle}>Automation</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={pbName}>Run on its own</span>
          <Dot color={paused ? PB.review : PB.live} label={saving ? 'Saving…' : paused ? 'Paused' : 'Running'} style={{ color: PB.tx }} />
        </span>
        <PbSwitch on={!paused} label="Automation running" onToggle={onToggle} />
      </div>
      <p style={{ ...pbBody, color: PB.tx2, margin: 0 }}>
        {paused ? 'Paused — nothing is read or published on its own. Buttons like “Publish now” still work.'
          : 'The worker checks every minute: reads new products, sends them to matching websites, writes listings and publishes them.'}
      </p>
      <PbButton kind="primary" block icon="refresh" onClick={onRun} busy={running} busyLabel="Running… (up to 2 min)" dim={dim}>Run now</PbButton>
      {run && (
        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16 }}>
          <span style={{ ...pbLabel, marginBottom: 0 }}>Last run</span>
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: 12, margin: 0 }}>
            {counts.map(([l, n, c]) => (
              <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <dt>{n ? <Dot color={c} label={l} /> : <span style={pbMeta}>{l}</span>}</dt>
                <dd style={{ ...pbNum, margin: 0, fontSize: 22, fontWeight: 500, lineHeight: 1.2, color: n ? PB.tx : PB.tx2 }}>{n.toLocaleString('en-IN')}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </PbTile>
  );
}

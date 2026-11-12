// Settings → the automation status tile (desktop 4 wide beside the form;
// phone after it): the on/off switch row, what that means right now, "Run
// now" (the page's one gradient), the daily AI limit and the last run's
// counts. Paused is a lasting page-wide state, so the tile takes the review
// tint. Pre-launch check, 2026-11-13: the text says what a pause really
// stops, and the daily limit (₹ of AI per day, after which reading and
// writing stop until tomorrow) is set here, beside what today has cost.
import { useState } from 'react';
import PbSwitch from '../ui/PbSwitch';
import { PB, pbBody, pbLabel, pbMeta, pbName, pbNum, pbTileTitle } from '../../pbTheme';
import type { WorkResult } from '../../data/settings';
import { Dot, rupees } from '../product/status';
import { PbButton, PbTile } from '../ui';
import { Field, NumInput } from '../website/ui';

export default function AutomationTile({ paused, saving, running, dim, run, onToggle, onRun, limit, spent, savingLimit, onLimit }: {
  paused: boolean; saving: boolean; running: boolean; dim: boolean; run: WorkResult | null; onToggle: () => void; onRun: () => void;
  /** ₹ per day; 0 = no limit. `spent` = what the AI has cost today (null while it loads). */
  limit: number; spent: number | null; savingLimit: boolean; onLimit: (v: number) => void;
}) {
  const [typed, setTyped] = useState<number | null>(limit || null);
  const [was, setWas] = useState(limit);
  if (was !== limit) { setWas(limit); setTyped(limit || null); } // saved elsewhere, or just saved: show the stored value
  const dirty = (typed ?? 0) !== limit;
  const reached = limit > 0 && spent != null && spent >= limit;
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
        {paused ? 'Paused — nothing is read, written or published on its own, and a run that was going stops. A stock change you make still reaches your stores. Telegram posts are saved and wait, a vendor’s stock notice too: it is acted on when you switch this back on. “Run one round now” and buttons like “Publish now” still work.'
          : 'The worker checks every minute: reads new products, sends them to matching websites, writes listings and publishes them.'}
      </p>
      <PbButton kind="primary" block icon="refresh" onClick={onRun} busy={running} busyLabel="Running… (up to 2 min)" dim={dim}>{paused ? 'Run one round now' : 'Run now'}</PbButton>
      <form onSubmit={e => { e.preventDefault(); if (dirty && !savingLimit) onLimit(typed ?? 0); }} style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16 }}>
        <Field label="Daily AI limit ₹" htmlFor="pbs-limit" hint="Once the AI has cost this much in a day, writing listings and reading imported products stop until tomorrow. Vendor posts from Telegram are still read (a few paise each), so a stock notice is never missed, and sending to Shopify goes on. Empty = no limit.">
          <NumInput id="pbs-limit" value={typed} max={1000000} placeholder="No limit" onChange={setTyped} />
        </Field>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <PbButton type="submit" disabled={!dirty} busy={savingLimit} busyLabel="Saving…">Save limit</PbButton>
          {reached ? <Dot color={PB.review} style={{ whiteSpace: 'normal', color: PB.tx }} label={<span>Used up today (<span style={pbNum}>{rupees(spent)}</span>): nothing more is written until tomorrow, or a higher limit. Vendor posts are still read.</span>} />
            : <span style={pbMeta}>Today so far <span style={{ ...pbNum, color: PB.tx }}>{spent == null ? '…' : rupees(spent)}</span></span>}
        </div>
      </form>
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
          {run.limit && <Dot color={PB.review} style={{ whiteSpace: 'normal' }} label="Today’s AI limit is used up, so nothing was written. Only vendor posts were read." />}
          {run.paused && <Dot color={PB.review} style={{ whiteSpace: 'normal' }} label="Automation was paused while it ran, so it stopped early." />}
          {!!run.stock && <span style={pbMeta}><span style={pbNum}>{run.stock.toLocaleString('en-IN')}</span> stock change{run.stock === 1 ? '' : 's'} sent to stores</span>}
        </div>
      )}
    </PbTile>
  );
}

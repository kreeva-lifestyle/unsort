// Step 3 — the crawler: the staff Telegram account on a small cloud server
// that checks each vendor channel once a day and forwards new posts to the admin group.
// Admin / manager creates its key (shown once, with Copy; it replaces the old
// key). Everyone sees when it last reported, its version, and the daily checks
// (`schedule`, TgSchedule: each channel once a day in the overnight window).
import type { ReactNode } from 'react';
import { CRAWLER_STALE_MIN, crawlerRunning } from '../../../data/telegram';
import { istDate, istRelative } from '../../../format';
import { PB, pbBody, pbErrorBox, pbMeta, pbNum } from '../../../pbTheme';
import type { PbTgConfig } from '../../../types';
import { NEUTRAL } from '../../product/status';
import PbButton from '../../ui/PbButton';
import { TgStep, TgValueBox, type StepState } from './TgStep';

type Props = {
  config: PbTgConfig | null; canManage: boolean; busy: string; newKey: string | null;
  onKey: () => void; onHideKey: () => void; onCopy: (text: string, what: string) => void; onGuide: () => void; schedule: ReactNode;
};

export const crawlerState = (c: PbTgConfig | null): StepState =>
  !c?.crawler_seen_at ? { color: NEUTRAL, label: 'Not running yet' }
    : !crawlerRunning(c) ? { color: PB.failed, label: 'Stopped' }
      : c.crawler_error || c.crawler_channels.some(ch => ch.error) ? { color: PB.review, label: 'Running, with problems' }
        : { color: PB.live, label: 'Running' };

export default function TgCrawlerStep({ config, canManage, busy, newKey, onKey, onHideKey, onCopy, onGuide, schedule }: Props) {
  const seen = config?.crawler_seen_at;
  const running = crawlerRunning(config);
  return (
    <TgStep n={3} id="pbs-tg-crawler" title="Crawler" state={crawlerState(config)}>
      <p style={{ ...pbBody, color: PB.tx2, margin: 0 }}>
        A staff Telegram account on a small cloud server checks each vendor channel once a day and forwards the new posts to the admin group, one channel at a time.
      </p>
      <div><PbButton icon="book" onClick={onGuide}>How to set it up</PbButton></div>
      {newKey && (
        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <TgValueBox label="New crawler key">{newKey}</TgValueBox>
          <p style={{ ...pbBody, margin: 0 }}>
            Shown only once. Paste it on the server now (Railway → Variables → <span style={pbNum}>PB_CRAWLER_KEY</span>). Any older key has stopped working.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <PbButton icon="copy" onClick={() => onCopy(newKey, 'Crawler key')} dim={!!busy}>Copy key</PbButton>
            <PbButton onClick={onHideKey} dim={!!busy}>I saved it — hide</PbButton>
          </div>
        </div>
      )}
      {seen && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={pbMeta}>Last seen <span style={{ color: PB.tx }}>{istRelative(seen)}</span> · {istDate(seen)}</span>
          {config?.crawler_version && <span style={pbMeta}>Version <span style={{ ...pbNum, color: PB.tx }}>{config.crawler_version}</span></span>}
        </div>
      )}
      {seen && !running && (
        <div role="alert" style={pbErrorBox}>No report for more than {CRAWLER_STALE_MIN} minutes — check the server it runs on (Railway or your VPS) and restart it.</div>
      )}
      {config?.crawler_error && (running
        ? <div style={{ ...pbErrorBox, background: PB.reviewBg, border: `1px solid ${PB.reviewBd}`, color: PB.tx, overflowWrap: 'anywhere' }}>{config.crawler_error}</div>
        : <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>Its last message: {config.crawler_error}</span>)}
      {!canManage && !seen && <p style={{ ...pbMeta, margin: 0 }}>An admin or manager creates the crawler key here.</p>}
      {canManage && !newKey && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <PbButton icon="key" onClick={onKey} busy={busy === 'key'} busyLabel="Creating…" dim={!!busy && busy !== 'key'}>
            {seen ? 'Replace crawler key' : 'Create crawler key'}
          </PbButton>
          <span style={pbMeta}>A new key replaces the old one.</span>
        </div>
      )}
      {schedule}
    </TgStep>
  );
}

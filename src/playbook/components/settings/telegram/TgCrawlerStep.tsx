// Step 3 — the crawler: the staff Telegram account on a small cloud server
// that reads the vendor channels and forwards new posts to the admin group.
// Admin / manager creates its key (shown once, with Copy; it replaces the old
// key). Everyone sees when it last reported, its version and each channel.
import { CRAWLER_STALE_MIN, crawlerRunning } from '../../../data/telegram';
import { istDate, istRelative } from '../../../format';
import { PB, pbErrorBox, pbLabel, pbMeta, pbNum } from '../../../pbTheme';
import type { PbTgChannel, PbTgConfig } from '../../../types';
import { Dot, NEUTRAL } from '../../product/status';
import PbButton from '../../ui/PbButton';
import { TgStep, TgValueBox, type StepState } from './TgStep';

type Props = {
  config: PbTgConfig | null; canManage: boolean; busy: string; newKey: string | null;
  onKey: () => void; onHideKey: () => void; onCopy: (text: string, what: string) => void; onGuide: () => void;
};

export const crawlerState = (c: PbTgConfig | null): StepState =>
  !c?.crawler_seen_at ? { color: NEUTRAL, label: 'Not running yet' }
    : !crawlerRunning(c) ? { color: PB.failed, label: 'Stopped' }
      : c.crawler_error || c.crawler_channels.some(ch => ch.error) ? { color: PB.review, label: 'Running, with problems' }
        : { color: PB.live, label: 'Running' };

function Channel({ ch }: { ch: PbTgChannel }) {
  const name = ch.title || (ch.username ? `@${ch.username}` : `Channel ${ch.channel_id ?? ''}`);
  return (
    <li style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', borderTop: `1px solid ${PB.tileBd}`, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: PB.tx, overflowWrap: 'anywhere', minWidth: 0 }}>{name}</span>
        {ch.title && ch.username && <span style={{ ...pbNum, fontSize: 12, color: PB.tx2 }}>@{ch.username}</span>}
        <span style={{ ...pbMeta, marginLeft: 'auto' }}>
          {ch.last_id != null ? <>Last post <span style={{ ...pbNum, color: PB.tx }}>#{ch.last_id}</span></> : 'No posts read yet'}
        </span>
      </div>
      {ch.error && <Dot color={PB.failed} label={ch.error} style={{ whiteSpace: 'normal', color: PB.tx, overflowWrap: 'anywhere' }} />}
    </li>
  );
}

export default function TgCrawlerStep({ config, canManage, busy, newKey, onKey, onHideKey, onCopy, onGuide }: Props) {
  const seen = config?.crawler_seen_at;
  const running = crawlerRunning(config);
  const channels = config?.crawler_channels ?? [];
  return (
    <TgStep n={3} id="pbs-tg-crawler" title="Crawler" state={crawlerState(config)}>
      <p style={{ ...pbMeta, margin: 0 }}>
        A staff Telegram account on a small cloud server reads the vendor channels and forwards each new post to the admin group.
      </p>
      <div><PbButton icon="book" onClick={onGuide}>How to set it up</PbButton></div>
      {newKey && (
        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <TgValueBox label="New crawler key">{newKey}</TgValueBox>
          <p style={{ ...pbMeta, margin: 0, color: PB.tx }}>
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
          <span style={pbMeta} title={istDate(seen)}>Last seen <span style={{ color: PB.tx }}>{istRelative(seen)}</span></span>
          {config?.crawler_version && <span style={pbMeta}>Version <span style={{ ...pbNum, color: PB.tx }}>{config.crawler_version}</span></span>}
        </div>
      )}
      {seen && !running && (
        <div role="alert" style={pbErrorBox}>No report for more than {CRAWLER_STALE_MIN} minutes — check the server it runs on (Railway or your VPS) and restart it.</div>
      )}
      {config?.crawler_error && (running
        ? <div style={{ ...pbErrorBox, background: PB.reviewBg, border: `1px solid ${PB.reviewBd}`, color: PB.tx, overflowWrap: 'anywhere' }}>{config.crawler_error}</div>
        : <div role="alert" style={{ ...pbErrorBox, overflowWrap: 'anywhere' }}>{config.crawler_error}</div>)}
      {seen && (
        <div style={{ minWidth: 0 }}>
          <span style={{ ...pbLabel, marginBottom: 4 }}>Channels · {channels.length}</span>
          {channels.length === 0
            ? <p style={{ ...pbMeta, margin: 0 }}>No channels yet — add each vendor’s Telegram channel under Vendors → Edit.</p>
            : <ul aria-label="Vendor channels" style={{ margin: 0, padding: 0 }}>{channels.map((ch, i) => <Channel key={`${ch.username ?? ch.channel_id}-${i}`} ch={ch} />)}</ul>}
        </div>
      )}
      {!canManage && !seen && <p style={{ ...pbMeta, margin: 0 }}>An admin or manager creates the crawler key here.</p>}
      {canManage && !newKey && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <PbButton icon="key" onClick={onKey} busy={busy === 'key'} busyLabel="Creating…" dim={!!busy && busy !== 'key'}>
            {seen ? 'Replace crawler key' : 'Create crawler key'}
          </PbButton>
          <span style={pbMeta}>A new key replaces the old one.</span>
        </div>
      )}
    </TgStep>
  );
}

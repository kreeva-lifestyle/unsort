// Settings → Telegram → Crawler: the once-a-day checks. Says the overnight
// window in words, lets an admin / manager change it ("Edit window") or space
// every channel evenly ("Spread evenly"), and lists each vendor channel in
// time order (11 PM before 1 AM): its daily time, next check and last result.
import { useState } from 'react';
import type { TgScheduleRow } from '../../../data/telegram';
import { minuteLabel, nextCheck, upcomingLabel, windowOffset } from '../../../data/tgSchedule';
import { count, istDate, istRelative } from '../../../format';
import { PB, pbLabel, pbMeta, pbNum } from '../../../pbTheme';
import type { PbTgChannel } from '../../../types';
import { Dot } from '../../product/status';
import { TgHandle } from '../../vendors/VendorTg';
import PbButton from '../../ui/PbButton';
import TgWindowForm from './TgWindowForm';

type Props = {
  rows: TgScheduleRow[]; channels: PbTgChannel[]; start: number; end: number; canManage: boolean; busy: string;
  onSaveWindow: (start: number, end: number) => Promise<boolean>; onSpread: () => void;
};

/** The crawler's last report for this vendor's channel (by id, else by username). */
const reportOf = (r: TgScheduleRow, channels: PbTgChannel[]) =>
  channels.find(c => (r.tg_channel_id !== null && c.channel_id === r.tg_channel_id) || (!!r.tg_username && c.username === r.tg_username));

function Row({ r, report, now }: { r: TgScheduleRow; report?: PbTgChannel; now: number }) {
  const slot = r.tg_slot_minute;
  const next = slot === null ? null : nextCheck({ slot, checkedAt: r.tg_checked_at, slotSetAt: r.tg_slot_set_at, cursorReady: r.tg_cursor_ready }, now);
  const result = report?.error
    ? <Dot color={PB.failed} label={report.error} style={{ whiteSpace: 'normal', color: PB.tx, overflowWrap: 'anywhere' }} />
    : !r.tg_cursor_ready
      ? <Dot color={PB.busy} label="Getting ready — the crawler notes its newest post first, so old posts are not copied" style={{ whiteSpace: 'normal', color: PB.tx }} />
      : r.tg_checked_at
        ? <span style={pbMeta} title={istDate(r.tg_checked_at)}>Last checked <span style={{ color: PB.tx }}>{istRelative(r.tg_checked_at, now)}</span>
          {report?.sent != null && <> · <span style={{ whiteSpace: 'nowrap' }}><span style={pbNum}>{count(report.sent)}</span> {report.sent === 1 ? 'message' : 'messages'} copied</span></>}</span>
        : <span style={pbMeta}>Not checked yet</span>;
  return (
    <li style={{ listStyle: 'none', display: 'flex', gap: 12, padding: '12px 0', borderTop: `1px solid ${PB.tileBd}`, minWidth: 0 }}>
      {slot === null
        ? <span style={{ ...pbMeta, width: 76, flexShrink: 0 }}>Time not set yet</span>
        : <span style={{ ...pbNum, width: 76, flexShrink: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: PB.tx }}>{minuteLabel(slot)}</span>}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', columnGap: 8, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: PB.tx, overflowWrap: 'anywhere', minWidth: 0 }}>{r.name}</span>
          {r.tg_username && <span style={{ ...pbNum, fontSize: 12, color: PB.tx2, overflowWrap: 'normal', wordBreak: 'normal', minWidth: 0 }}><TgHandle u={r.tg_username} /></span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', columnGap: 16, rowGap: 4, flexWrap: 'wrap', minWidth: 0 }}>
          {next && r.tg_cursor_ready && (next.due
            ? <Dot color={PB.review} label="Due now — checked next" style={{ whiteSpace: 'normal', color: PB.tx }} />
            : <span style={pbMeta}>Next check <span style={{ color: PB.tx, whiteSpace: 'nowrap' }}>{upcomingLabel(next.at, slot!, now)}</span></span>)}
          {result}
        </div>
      </div>
    </li>
  );
}

export default function TgSchedule({ rows, channels, start, end, canManage, busy, onSaveWindow, onSpread }: Props) {
  const [editing, setEditing] = useState(false);
  const now = Date.now();
  const sorted = [...rows].sort((a, b) =>
    (a.tg_slot_minute === null ? 1e4 : windowOffset(a.tg_slot_minute, start)) - (b.tg_slot_minute === null ? 1e4 : windowOffset(b.tg_slot_minute, start))
    || a.name.localeCompare(b.name));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <span style={{ ...pbLabel, marginBottom: -4 }}>Daily checks · <span style={pbNum}>{rows.length}</span></span>
      <p style={{ ...pbMeta, margin: 0, color: PB.tx }}>
        Channels are checked once a day between {minuteLabel(start)} and {minuteLabel(end)}, each at its own time.
        <span style={{ color: PB.tx2 }}> A new channel gets the free time furthest from the others, so checks never pile up.</span>
      </p>
      {canManage && (editing
        ? <TgWindowForm start={start} end={end} busy={busy} onSave={onSaveWindow} onCancel={() => setEditing(false)} />
        : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <PbButton icon="edit" onClick={() => setEditing(true)} dim={!!busy}>Edit window</PbButton>
            {rows.length > 1 && <PbButton icon="swap" onClick={onSpread} busy={busy === 'spread'} busyLabel="Spreading…" dim={!!busy && busy !== 'spread'}>Spread evenly</PbButton>}
          </div>
        ))}
      {sorted.length === 0
        ? <p style={{ ...pbMeta, margin: 0 }}>No channels yet — add each vendor’s Telegram channel under <span style={{ color: PB.tx }}>Vendors → Edit</span>. Each one gets its own daily time.</p>
        : <ul aria-label="Daily checks, in time order" style={{ margin: 0, padding: 0 }}>
          {sorted.map(r => <Row key={r.id} r={r} report={reportOf(r, channels)} now={now} />)}
        </ul>}
      {!canManage && rows.length > 0 && <p style={{ ...pbMeta, margin: 0 }}>An admin or manager can change the window.</p>}
    </div>
  );
}

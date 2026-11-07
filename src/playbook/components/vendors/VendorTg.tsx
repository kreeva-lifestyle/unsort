// A vendor's Telegram channel and its once-a-day check, as one meta line:
// "@kumari_art · checked daily at 1:12 AM · last checked 3 h ago". Used on the
// vendor row and in the Edit vendor sheet. The daily time is given by the
// database when the channel is saved (spread so channels never clash).
import { istDate, istRelative } from '../../format';
import { minuteLabel } from '../../data/tgSchedule';
import { PB, pbMeta, pbNum } from '../../pbTheme';
import type { PbVendor } from '../../types';

type Tg = Pick<PbVendor, 'active' | 'tg_username' | 'tg_title' | 'tg_slot_minute' | 'tg_checked_at'>;

/** "@jaipur_prints_official" that breaks only after an underscore (never "offi / cial") on a narrow phone. */
export function TgHandle({ u }: { u: string }) {
  const parts = u.split('_');
  return <>@{parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 && <>_<wbr /></>}</span>)}</>;
}

/** "checked daily at 1:12 AM" · "not checked while inactive" · "daily time not set yet". */
export function dailyWords(v: Tg): string {
  if (!v.active) return 'not checked while inactive';
  return v.tg_slot_minute === null ? 'daily time not set yet' : `checked daily at ${minuteLabel(v.tg_slot_minute)}`;
}

export default function VendorTg({ v }: { v: Tg }) {
  if (!v.tg_username && !v.tg_title) return null;
  return (
    <span style={{ ...pbMeta, display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 0, minWidth: 0 }}>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }} title={v.tg_title ?? undefined}>
        <span className="pb-sr">Telegram channel </span>
        {v.tg_username
          ? <span style={{ ...pbNum, color: PB.tx, overflowWrap: 'normal', wordBreak: 'normal' }}><TgHandle u={v.tg_username} /></span>
          : <>Telegram · {v.tg_title}</>}
        {' · '}<span style={{ whiteSpace: 'nowrap' }}>{dailyWords(v)}</span>
      </span>
      <span title={v.tg_checked_at ? istDate(v.tg_checked_at) : undefined}>
        {v.tg_checked_at ? <>Last checked <span style={{ color: PB.tx }}>{istRelative(v.tg_checked_at)}</span></> : 'Not checked yet'}
      </span>
    </span>
  );
}

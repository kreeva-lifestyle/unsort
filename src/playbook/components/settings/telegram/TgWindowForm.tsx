// Settings → Telegram → Crawler → "Edit window" (admin / manager): the start
// and end of the overnight window the channels are checked in. It may run past
// midnight and must be at least an hour long; saving spreads every channel
// evenly over the new window (the server does both in one step).
import { useState } from 'react';
import { hhmmToMinute, minuteLabel, minuteToHHMM, windowLength, windowProblem } from '../../../data/tgSchedule';
import { PB, pbErrorBox, pbInput, pbMeta, pbNum } from '../../../pbTheme';
import PbButton from '../../ui/PbButton';
import { Field } from '../../website/ui';

type Props = { start: number; end: number; busy: string; onSave: (start: number, end: number) => Promise<boolean>; onCancel: () => void };

export default function TgWindowForm({ start, end, busy, onSave, onCancel }: Props) {
  const [from, setFrom] = useState(minuteToHHMM(start));
  const [to, setTo] = useState(minuteToHHMM(end));
  const [err, setErr] = useState('');
  const s = hhmmToMinute(from), e = hhmmToMinute(to);
  const len = s !== null && e !== null ? windowLength(s, e) : 0;

  const save = async () => {
    if (busy) return;
    const problem = windowProblem(s, e);
    if (problem) { setErr(problem); return; }
    setErr('');
    if (await onSave(s!, e!)) onCancel();
  };

  return (
    <form onSubmit={ev => { ev.preventDefault(); void save(); }} aria-label="Check window"
      style={{ display: 'flex', flexDirection: 'column', minWidth: 0, padding: 16, borderRadius: PB.r.input, background: PB.ctl, border: `1px solid ${PB.ctlBd}` }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px', minWidth: 0 }}>
          <Field label="Start" htmlFor="pbs-tg-win-start">
            <input id="pbs-tg-win-start" type="time" step={60} value={from} onChange={ev => { setFrom(ev.target.value); setErr(''); }}
              required className="pb-input" style={{ ...pbInput, ...pbNum }} />
          </Field>
        </div>
        <div style={{ flex: '1 1 140px', minWidth: 0 }}>
          <Field label="End" htmlFor="pbs-tg-win-end">
            <input id="pbs-tg-win-end" type="time" step={60} value={to} onChange={ev => { setTo(ev.target.value); setErr(''); }}
              required className="pb-input" style={{ ...pbInput, ...pbNum }} />
          </Field>
        </div>
      </div>
      <p style={{ ...pbMeta, margin: '0 0 12px' }} aria-live="polite">
        {s !== null && e !== null && len > 0
          ? <>From <span style={{ color: PB.tx }}>{minuteLabel(s)}</span> to <span style={{ color: PB.tx }}>{minuteLabel(e)}</span>{e < s ? ' the next morning' : ''} · <span style={pbNum}>{len >= 60 ? `${Math.floor(len / 60)} h${len % 60 ? ` ${len % 60} min` : ''}` : `${len} min`}</span>. </>
          : null}
        At least 1 hour; it may run past midnight. Saving spreads every channel evenly over the new window; saved during the night, a channel whose new time has already passed is checked the next night.
      </p>
      {err && <div role="alert" style={{ ...pbErrorBox, marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <PbButton type="submit" busy={busy === 'window'} busyLabel="Saving…" dim={!!busy && busy !== 'window'}>Save window</PbButton>
        <PbButton onClick={onCancel} dim={!!busy}>Cancel</PbButton>
      </div>
    </form>
  );
}

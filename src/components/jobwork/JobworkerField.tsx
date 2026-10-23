// The job form's Jobworker field: the vendor picker and, on a new job, the
// last 5 jobworkers given work as one-tap chips under it (owner's ask) —
// newest first, a typed name resolved to the vendor master (recent_jobworkers).
// A tap fills the jobworker as picking it from the suggestions does; the one
// picked is lit. A pick (chip, suggestion or quick-add — never a keystroke)
// also looks up the jobworker's last job and hands its type to the form.
import { useEffect, useRef, useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import VendorPicker from '../purchaseorders/VendorPicker';
import { recentJobworkers, lastJobType, type RecentJobworker } from './jobworkApi';

export default function JobworkerField({ name, phone, vendorId, recent, onPick, onLastType, addToast }: {
  name: string; phone: string; vendorId: string | null;
  /** Show the recent-jobworker chips (a new job, not an edit). */
  recent: boolean;
  onPick: (v: RecentJobworker) => void;
  /** The type of the picked jobworker's newest job ('' when they have none). */
  onLastType: (type: string) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [list, setList] = useState<RecentJobworker[]>([]);
  // Only the latest pick's answer counts when two arrive out of order.
  const seq = useRef(0);
  const pick = (v: RecentJobworker, lookup: boolean) => {
    onPick(v);
    const n = ++seq.current;   // a later pick or keystroke outranks an answer still in flight
    if (!lookup) return;
    lastJobType(v).then(({ type, error }) => {
      if (n !== seq.current) return;
      if (error) { addToast(friendlyError(error), 'error'); return; }
      onLastType(type);
    });
  };
  useEffect(() => {
    if (!recent) return;
    let alive = true;
    recentJobworkers(5).then(({ list: l, error }) => {
      if (!alive) return;
      if (error) { addToast(friendlyError(error), 'error'); return; }
      setList(l);
    });
    return () => { alive = false; };
  }, [recent, addToast]);

  const isOn = (w: RecentJobworker) => (w.id ? w.id === vendorId : !vendorId && w.name.toLowerCase() === name.trim().toLowerCase());
  // Two vendors with one name (the master allows it with different phones): the phone's last digits tell them apart.
  const label = (w: RecentJobworker) => (w.phone && list.filter(x => x.name.toLowerCase() === w.name.toLowerCase()).length > 1 ? `${w.name} · ${w.phone.slice(-4)}` : w.name);
  return (
    <div>
      <VendorPicker value={name} phone={phone} addToast={addToast} onPick={v => pick(v, !!v.id)} />
      {recent && list.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 10, color: T.tx3 }}>Recent:</span>
          {list.map(w => {
            const on = isOn(w);
            return (
              <button key={`${w.id ?? ''}:${w.name}`} type="button" className="touch44" aria-pressed={on} title={w.phone ? `${w.name} · ${w.phone}` : w.name}
                onClick={() => pick(w, true)}
                style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, maxWidth: 180, borderRadius: 999, padding: '5px 12px', fontSize: 11, ...(on ? { borderColor: T.ac, color: T.ac2, background: T.ac3 } : {}) }}>
                <span style={{ display: 'block', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(w)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

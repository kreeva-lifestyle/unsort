// The job form's Jobworker field: the vendor picker and, on a new job, the
// last 5 jobworkers given work as one-tap chips under it (owner's ask) —
// newest first, one per name (recent_jobworkers). A tap fills the jobworker
// exactly as picking it from the suggestions does; the one picked is lit.
import { useEffect, useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import VendorPicker from '../purchaseorders/VendorPicker';
import { recentJobworkers, type RecentJobworker } from './jobworkApi';

export default function JobworkerField({ name, phone, vendorId, recent, onPick, addToast }: {
  name: string; phone: string; vendorId: string | null;
  /** Show the recent-jobworker chips (a new job, not an edit). */
  recent: boolean;
  onPick: (v: RecentJobworker) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [list, setList] = useState<RecentJobworker[]>([]);
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
  return (
    <div>
      <VendorPicker value={name} phone={phone} addToast={addToast} onPick={onPick} />
      {recent && list.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 10, color: T.tx3 }}>Recent:</span>
          {list.map(w => {
            const on = isOn(w);
            return (
              <button key={`${w.id ?? ''}:${w.name}`} type="button" className="touch44" aria-pressed={on} title={w.phone ? `${w.name} · ${w.phone}` : w.name}
                onClick={() => onPick(w)}
                style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, maxWidth: 180, borderRadius: 999, padding: '5px 12px', fontSize: 11, ...(on ? { borderColor: T.ac, color: T.ac2, background: T.ac3 } : {}) }}>
                <span style={{ display: 'block', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// One attribute's values for a product (from ProductValues): the allowed
// values of the product's category as chips — tap to choose; a "one value"
// attribute keeps only the last tap. Save (the sheet's gradient) sends staff's
// choice (product_values_set: 'manual', 'tags' locked); saving the last
// missing attribute re-runs the gate, so the product turns Ready and goes to
// its websites — the toast says so.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { setProductValues } from '../../data/tags';
import type { PbAttribute } from '../../tagTypes';
import { PB, pbActive, pbBody, pbBtnSecondary, pbErrorBox, pbInput } from '../../pbTheme';
import { useIsPhone } from '../../hooks/useIsPhone';
import PbModal from './PbModal';
import PbButton from '../ui/PbButton';
import PbIcon from '../ui/PbIcon';

export default function ValuesSheet({ attr, chosen, productId, save, addToast, onClose, onSaved }: {
  attr: PbAttribute | null; chosen: string[]; productId: string; save: typeof setProductValues; addToast: AddToast; onClose: () => void; onSaved: () => void;
}) {
  const phone = useIsPhone();
  const [sel, setSel] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const key = chosen.join('|');
  useEffect(() => { setSel(key ? key.split('|') : []); setQ(''); setErr(''); }, [attr, key]);
  if (!attr) return null;
  const dirty = [...sel].sort().join('|') !== [...chosen].sort().join('|');
  const toggle = (id: string) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : attr.multi ? [...s, id] : [id]));
  const k = q.trim().toLowerCase();
  const list = k ? attr.values.filter(v => v.name.toLowerCase().includes(k) || v.aliases.some(a => a.includes(k))) : attr.values;
  const doSave = async () => {
    setBusy(true); setErr('');
    try {
      const r = await save(productId, sel, attr.id);
      const names = attr.values.filter(v => sel.includes(v.id)).map(v => v.name).join(', ');
      addToast(r.status === 'ready' && r.routed ? `Saved ${attr.name}: ${names} — the product is ready and went to ${r.routed} website${r.routed === 1 ? '' : 's'}`
        : r.missing?.length ? `Saved ${attr.name} — still needs ${r.missing.join(', ')}` : `Saved ${attr.name}${names ? `: ${names}` : ''}`, r.missing?.length ? 'info' : 'success');
      onSaved(); onClose();
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  const footer = (
    <div style={{ display: 'flex', flexDirection: phone ? 'column' : 'row', justifyContent: 'flex-end', gap: 12 }}>
      {!phone && <PbButton onClick={onClose} dim={busy}>Cancel</PbButton>}
      <PbButton kind={dirty ? 'primary' : 'secondary'} block={phone} onClick={() => void doSave()} disabled={!dirty} busy={busy} busyLabel="Saving…">{dirty ? `Save ${attr.name}` : 'Nothing changed yet'}</PbButton>
    </div>
  );
  const chip = { ...pbBtnSecondary, minHeight: 'var(--pb-chip-h)', padding: '4px 14px', borderRadius: PB.r.pill, fontWeight: 500, gap: 6, maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left' } as const;
  return (
    <PbModal open title={attr.name} onClose={onClose} footer={footer} dirty={dirty && !busy} discardTitle={`Discard changes to ${attr.name}?`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
        <p style={{ ...pbBody, color: PB.tx2, margin: 0 }}>{attr.multi ? 'Tap every value that fits.' : 'Tap the one value that fits.'} Your choice is kept: the AI will not change it.</p>
        {attr.values.length > 12 && (
          <>
            <label htmlFor="pbpv-q" className="pb-sr">Find a {attr.name} value</label>
            <input id="pbpv-q" value={q} onChange={e => setQ(e.target.value)} placeholder={`Find a ${attr.name.toLowerCase()}…`} className="pb-input" style={pbInput} />
          </>
        )}
        <div role="group" aria-label={`${attr.name} values`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {list.map(v => {
            const on = sel.includes(v.id);
            return (
              <button key={v.id} type="button" aria-pressed={on} onClick={() => toggle(v.id)} className="pb-pill" style={{ ...chip, ...(on ? pbActive : null), borderRadius: PB.r.pill }}>
                {on && <PbIcon name="check" size={16} />}<span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{v.name}</span>
              </button>
            );
          })}
          {!list.length && <span style={{ ...pbBody, color: PB.tx2 }}>{attr.values.length ? `No ${attr.name} value matches “${q.trim()}”.` : `${attr.name} has no values yet — add them on Settings → Tags.`}</span>}
        </div>
        {err && <div role="alert" style={pbErrorBox}>{err}</div>}
      </div>
    </PbModal>
  );
}

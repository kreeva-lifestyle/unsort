// One value's sheet (tap a value chip on the Tags page): its name (a rename
// is checked for look-alikes and applies to every product), the words it is
// "also known as" (kala, kaala… — one word can mean only one value), "Merge
// into…" another value of the same attribute (products move over, its names
// become also-known-as) and Delete (asks first; products lose the value and
// may go back to Needs info). Save is the sheet's one gradient.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { TAKE_BACK } from '../../data/bulk';
import type { AddToast } from '../PbToasts';
import { LookAlikeError, type TagsApi } from '../../data/tags';
import type { PbAttrValue, PbAttribute, PbLookAlike } from '../../tagTypes';
import { PB, pbBody, pbErrorBox, pbInput } from '../../pbTheme';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useConfirm } from '../../../components/ui/ConfirmModal';
import PbModal from '../product/PbModal';
import { PbButton, PbConfirm } from '../ui';
import { ChipsInput, Field } from '../website/ui';
import { lookSentence, plural } from './tagText';

export default function ValueSheet({ value, attr, api, addToast, onClose, onSaved }: {
  value: PbAttrValue | null; attr: PbAttribute | null; api: TagsApi; addToast: AddToast; onClose: () => void; onSaved: () => void;
}) {
  const phone = useIsPhone();
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState<string[]>([]);
  const [into, setInto] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'merge' | 'delete'>('');
  const [err, setErr] = useState('');
  const [warn, setWarn] = useState<PbLookAlike[] | null>(null);
  const { ask, modalProps } = useConfirm();
  useEffect(() => { if (value) { setName(value.name); setAliases(value.aliases); setInto(''); setErr(''); setWarn(null); } }, [value]);
  if (!value || !attr) return null;
  const nm = name.trim().replace(/\s+/g, ' ');
  const dirty = nm !== value.name || aliases.join('|') !== value.aliases.join('|');
  const others = attr.values.filter(v => v.id !== value.id);

  const save = async (force = false) => {
    if (!nm) { setErr('Give the value a name.'); return; }
    setBusy('save'); setErr('');
    try { await api.saveValue({ attribute_id: attr.id, id: value.id, name: nm, aliases, force }); addToast(`Saved ${nm}`, 'success'); onSaved(); onClose(); }
    catch (e) { if (e instanceof LookAlikeError) setWarn(e.matches); else setErr(friendlyError(e)); }
    finally { setBusy(''); }
  };
  const merge = async () => {
    const to = others.find(v => v.id === into);
    if (!to) return;
    const ok = await ask({ title: `Merge ${value.name} into ${to.name}?`, message: `Products with ${value.name} get ${to.name}, and “${value.name}” becomes another name for ${to.name}. ${(value.uses ?? 0) >= 2 ? TAKE_BACK : 'This cannot be undone.'}`, confirmLabel: `Merge into ${to.name}` });
    if (!ok) return;
    setBusy('merge');
    try { const r = await api.mergeValue(value.id, to.id); addToast(`Merged — ${plural(r.moved ?? 0, 'product')} moved to ${to.name}`, 'success'); onSaved(); onClose(); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(''); }
  };
  const remove = async () => {
    const n = value.uses ?? 0;
    const ok = await ask({ title: `Delete ${value.name}?`, message: n ? `${plural(n, 'product')} lose${n === 1 ? 's' : ''} it; any that then have no ${attr.name} go back to Needs info.${n >= 2 ? ` ${TAKE_BACK}` : ''}` : 'No product uses it yet.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    setBusy('delete');
    try { await api.deleteValue(value.id); addToast(`Deleted ${value.name}`, 'success'); onSaved(); onClose(); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(''); }
  };
  const footer = (
    <div style={{ display: 'flex', flexDirection: phone ? 'column' : 'row', justifyContent: 'flex-end', gap: 12 }}>
      {!phone && <PbButton onClick={onClose} dim={!!busy}>Cancel</PbButton>}
      <PbButton kind={dirty ? 'primary' : 'secondary'} block={phone} onClick={() => void save(!!warn)} disabled={!dirty} busy={busy === 'save'} busyLabel="Saving…" dim={!!busy && busy !== 'save'}>
        {warn ? 'Save anyway' : dirty ? 'Save' : 'Nothing changed yet'}
      </PbButton>
    </div>
  );
  return (
    <PbModal open title={`${attr.name}: ${value.name}`} onClose={onClose} footer={footer} dirty={dirty && !busy} discardTitle="Discard changes to this value?">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8 }}>
        <Field label="Name" htmlFor="pbv-name" hint={`${plural(value.uses ?? 0, 'product')} use it. A new name shows on all of them.`}>
          <input id="pbv-name" value={name} onChange={e => { setName(e.target.value); setWarn(null); }} maxLength={80} className="pb-input" style={pbInput} />
        </Field>
        {warn?.[0] && <div role="alert" style={{ ...pbErrorBox, background: PB.reviewBg, borderColor: PB.reviewBd }}>{lookSentence(nm, warn[0])} Keep the old name, or save anyway.</div>}
        <Field label="Also known as" htmlFor="pbv-aka" hint="Other words that mean this value — Hindi or shop words such as kala, kaala. Products that say them get this value.">
          <ChipsInput id="pbv-aka" values={aliases} onChange={setAliases} placeholder="e.g. kaala — Enter adds it" maxLen={80} />
        </Field>
        {others.length > 0 && (
          <Field label="Merge into…" htmlFor="pbv-into" hint="Two values that mean the same thing? Keep one.">
            <div style={{ display: 'flex', gap: 8, flexWrap: phone ? 'wrap' : 'nowrap' }}>
              <select id="pbv-into" value={into} onChange={e => setInto(e.target.value)} className="pb-input" style={{ ...pbInput, minWidth: 0 }}>
                <option value="">— Pick a value —</option>
                {others.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <PbButton icon="merge" onClick={() => void merge()} disabled={!into} busy={busy === 'merge'} busyLabel="Merging…" dim={!!busy && busy !== 'merge'} style={{ flexShrink: 0 }}>Merge</PbButton>
            </div>
          </Field>
        )}
        {err && <div role="alert" style={pbErrorBox}>{err}</div>}
        <div style={{ borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16, marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <PbButton kind="danger" icon="trash" onClick={() => void remove()} busy={busy === 'delete'} busyLabel="Deleting…" dim={!!busy && busy !== 'delete'}>Delete value</PbButton>
          <span style={{ ...pbBody, color: PB.tx2 }}>Asks first.</span>
        </div>
      </div>
      <PbConfirm {...modalProps} />
    </PbModal>
  );
}

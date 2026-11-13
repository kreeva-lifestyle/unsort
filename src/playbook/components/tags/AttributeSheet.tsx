// New / edit attribute (Colour, Work, Fabric…): its name, one value or
// several per product, and the Shopify prefix used by stores whose tag style
// is "prefixed" ("Colour_Black"; empty = the attribute's name). Delete lives
// at the bottom of the body (never in the footer) and asks first: products
// lose its values, and categories stop needing it.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { TAKE_BACK } from '../../data/bulk';
import type { AddToast } from '../PbToasts';
import type { TagsApi } from '../../data/tags';
import type { PbAttribute } from '../../tagTypes';
import { PB, pbBody, pbErrorBox, pbInput } from '../../pbTheme';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useConfirm } from '../../../components/ui/ConfirmModal';
import PbModal from '../product/PbModal';
import { PbButton, PbConfirm } from '../ui';
import { Field, Seg } from '../website/ui';
import { plural } from './tagText';

export default function AttributeSheet({ open, attr, api, addToast, onClose, onSaved }: {
  open: boolean; attr: PbAttribute | null; api: TagsApi; addToast: AddToast; onClose: () => void; onSaved: (a?: PbAttribute) => void;
}) {
  const phone = useIsPhone();
  const [name, setName] = useState('');
  const [multi, setMulti] = useState<'one' | 'many'>('many');
  const [prefix, setPrefix] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'delete'>('');
  const [err, setErr] = useState('');
  const { ask, modalProps } = useConfirm();
  useEffect(() => { if (open) { setName(attr?.name ?? ''); setMulti(attr && !attr.multi ? 'one' : 'many'); setPrefix(attr?.shopify_prefix ?? ''); setErr(''); } }, [open, attr]);
  const nm = name.trim().replace(/\s+/g, ' ');
  const dirty = nm !== (attr?.name ?? '') || (multi === 'many') !== (attr?.multi ?? true) || prefix.trim() !== (attr?.shopify_prefix ?? '');

  const save = async () => {
    if (!nm) { setErr('Give the attribute a name, e.g. Colour.'); return; }
    if (busy) return;
    setBusy('save'); setErr('');
    try { const a = await api.saveAttribute({ id: attr?.id, name: nm, multi: multi === 'many', shopify_prefix: prefix.trim() }); addToast(attr ? `Saved ${nm}` : `Added ${nm} — now add its values`, 'success'); onSaved(a); onClose(); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(''); }
  };
  const remove = async () => {
    if (!attr) return;
    const n = attr.values.reduce((s, v) => s + (v.uses ?? 0), 0);
    if (!await ask({ title: `Delete ${attr.name}?`, message: `Its ${plural(attr.values.length, 'value')} go${attr.values.length === 1 ? 'es' : ''} too${n ? `, and ${plural(n, 'product tag')} with them` : ''}. Categories stop needing it.${attr.values.length || n >= 2 ? ` ${TAKE_BACK}` : ''}`, confirmLabel: 'Delete', danger: true })) return;
    setBusy('delete');
    try { await api.deleteAttribute(attr.id); addToast(`Deleted ${attr.name}`, 'success'); onSaved(); onClose(); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(''); }
  };
  const footer = (
    <div style={{ display: 'flex', flexDirection: phone ? 'column' : 'row', justifyContent: 'flex-end', gap: 12 }}>
      {!phone && <PbButton onClick={onClose} dim={!!busy}>Cancel</PbButton>}
      <PbButton kind={dirty ? 'primary' : 'secondary'} block={phone} onClick={() => void save()} disabled={!dirty} busy={busy === 'save'} busyLabel="Saving…" dim={busy === 'delete'}>
        {attr ? (dirty ? 'Save' : 'Nothing changed yet') : 'Add attribute'}
      </PbButton>
    </div>
  );
  return (
    <PbModal open={open} title={attr ? `Edit ${attr.name}` : 'New attribute'} onClose={onClose} footer={footer} dirty={dirty && !busy} discardTitle="Discard this attribute?">
      <form onSubmit={e => { e.preventDefault(); void save(); }} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8 }}>
        <Field label="Name" htmlFor="pba-name" hint="What the values describe: Colour, Work, Fabric, Occasion…">
          <input id="pba-name" value={name} onChange={e => setName(e.target.value)} maxLength={60} autoCapitalize="words" placeholder="e.g. Colour" className="pb-input" style={pbInput} />
        </Field>
        <Field label="Values per product">
          <Seg label="Values per product" value={multi} onChange={setMulti} options={[
            { id: 'many', label: 'Several', hint: 'Pink and Wine' }, { id: 'one', label: 'One only', hint: 'one Fabric' },
          ]} />
        </Field>
        <Field label="Shopify prefix (optional)" htmlFor="pba-prefix" hint={`Stores with the “prefixed” tag style send ${prefix.trim() || nm || 'Colour'}_Black. Empty = the attribute's name.`}>
          <input id="pba-prefix" value={prefix} onChange={e => setPrefix(e.target.value)} maxLength={40} placeholder={nm || 'Colour'} className="pb-input" style={pbInput} />
        </Field>
        {err && <div role="alert" style={pbErrorBox}>{err}</div>}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        {attr && (
          <div style={{ borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16, marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <PbButton kind="danger" icon="trash" onClick={() => void remove()} busy={busy === 'delete'} busyLabel="Deleting…" dim={busy === 'save'}>Delete attribute</PbButton>
            <span style={{ ...pbBody, color: PB.tx2 }}>Asks first.</span>
          </div>
        )}
      </form>
      <PbConfirm {...modalProps} />
    </PbModal>
  );
}

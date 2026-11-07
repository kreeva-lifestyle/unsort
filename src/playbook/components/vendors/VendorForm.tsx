// Add / edit a vendor: a short sheet (4 fields) through PbModal. Desktop
// footer: Cancel then Save; phone: one full-width Save (Cancel is the ×,
// swipe down or Back), in the PbModal footer. A filled form is guarded
// against scrim tap / swipe-down. Enter submits. The page owns the save and the state.
import { PB, pbErrorBox, pbInput, pbNum, pbTextarea } from '../../pbTheme';
import { useIsPhone } from '../../hooks/useIsPhone';
import PbModal from '../product/PbModal';
import { Field } from '../website/ui';
import PbButton from '../ui/PbButton';
import TgHint, { type SavedTg } from './VendorTgHint';

/** tg = the Telegram channel as typed (@name, name or a t.me link). */
export type VendorFormState = { id: string | null; name: string; code: string; notes: string; tg: string };

/** Phone only: the row's Deactivate / Activate, shown in the sheet body. */
export type VendorToggle = { active: boolean; name: string; busy: boolean; dim: boolean; onToggle: () => void };

export default function VendorForm({ form, setForm, saving, err, onSave, onClose, toggle, saved }: {
  form: VendorFormState | null; setForm: (f: VendorFormState) => void; saving: boolean; err: string; onSave: () => void; onClose: () => void;
  toggle?: VendorToggle; saved?: SavedTg;
}) {
  const phone = useIsPhone();
  return (
    <PbModal open={!!form} title={form?.id ? 'Edit vendor' : 'Add vendor'} onClose={onClose}
      guard={!!form && !!(form.name.trim() || form.code.trim() || form.notes.trim() || form.tg.trim())}
      footer={
        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
          {!phone && <PbButton onClick={onClose} dim={saving}>Cancel</PbButton>}
          <PbButton type="submit" form="pb-vendor-form" kind="primary" block={phone} busy={saving} busyLabel="Saving…">Save vendor</PbButton>
        </div>
      }>
      {form && (
        <form id="pb-vendor-form" onSubmit={e => { e.preventDefault(); onSave(); }} style={{ display: 'flex', flexDirection: 'column' }}>
          <Field label="Name" htmlFor="pbv-name">
            <input id="pbv-name" autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={120}
              autoCapitalize="words" enterKeyHint="next" aria-invalid={!!err && !form.name.trim()} className="pb-input" style={pbInput} />
          </Field>
          <Field label="Short code" htmlFor="pbv-code" hint="Optional — usable in tags as {vendor_code}, e.g. RG">
            <input id="pbv-code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} maxLength={20}
              autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="next" aria-describedby="pbv-code-hint"
              className="pb-input" style={{ ...pbInput, ...pbNum }} />
          </Field>
          <Field label="Telegram channel" htmlFor="pbv-tg"
            hint={<TgHint form={form} saved={saved} />}>
            <input id="pbv-tg" value={form.tg} onChange={e => setForm({ ...form, tg: e.target.value })} maxLength={80} placeholder="@channel_name"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" enterKeyHint="next" aria-describedby="pbv-tg-hint"
              className="pb-input" style={{ ...pbInput, ...pbNum }} />
          </Field>
          <Field label="Notes" htmlFor="pbv-notes">
            <textarea id="pbv-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} maxLength={1000} rows={3}
              autoCapitalize="sentences" className="pb-input" style={{ ...pbTextarea, minHeight: 96 }} />
          </Field>
          {err && <div role="alert" style={{ ...pbErrorBox, overflowWrap: 'anywhere' }}>{err}</div>}
          {toggle && (
            <div style={{ borderTop: `1px solid ${PB.tileBd}`, marginTop: err ? 16 : 0, paddingTop: 16, display: 'flex' }}>
              <PbButton kind={toggle.active ? 'danger' : 'secondary'} onClick={toggle.onToggle} busy={toggle.busy} busyLabel="Saving…" dim={toggle.dim || saving}
                aria-label={`${toggle.active ? 'Deactivate' : 'Activate'} ${toggle.name}`}>
                {toggle.active ? 'Deactivate' : 'Activate'}
              </PbButton>
            </div>
          )}
        </form>
      )}
    </PbModal>
  );
}

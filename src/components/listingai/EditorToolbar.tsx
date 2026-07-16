// Template-editor toolbar: bulk skip / fill-all / update-from-new-sheet +
// the mandatory/skipped counter. Extracted from TemplateManager for the
// file budget.
import { T, S } from '../../lib/theme';
import { isImageColumn } from './templateParse';
import type { ListingTemplateField } from '../../types/database';

export default function EditorToolbar({ fields, isSaved, onFields, onReupload, addToast }: {
  fields: ListingTemplateField[];
  isSaved: boolean; // editing an already-saved template (enables re-upload)
  onFields: (fields: ListingTemplateField[]) => void;
  onReupload: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  // Mandatory, fixed, wired, master-paired and photo columns are kept.
  const skippable = (f: ListingTemplateField) => !f.mandatory && !f.fixed && !f.skip && !f.sameAs && !f.masterAs && !isImageColumn(f.header);
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button onClick={() => {
        const n = fields.filter(skippable).length;
        onFields(fields.map(f => skippable(f) ? { ...f, skip: true } : f));
        addToast(n ? `${n} non-mandatory column(s) skipped — mandatory, fixed, wired, paired and photo columns kept` : 'Nothing to skip — everything left is mandatory, fixed, wired, paired or a photo column', 'success');
      }} style={{ ...S.btnGhost, ...S.btnSm }}>Skip all non-mandatory</button>
      <button onClick={() => onFields(fields.map(f => f.skip ? { ...f, skip: false } : f))} style={{ ...S.btnGhost, ...S.btnSm }}>Fill all</button>
      {isSaved && <button onClick={onReupload} title="Upload the marketplace's new sheet version — your settings are kept, changes are merged" style={{ ...S.btnGhost, ...S.btnSm }}>Update from new sheet</button>}
      <span style={{ fontSize: 10, color: T.tx3 }}>{fields.filter(f => f.mandatory).length} mandatory · {fields.filter(f => f.skip).length} skipped</span>
    </div>
  );
}

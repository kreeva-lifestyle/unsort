// Template-editor toolbar: bulk skip / fill-all / update-from-new-sheet +
// the mandatory/skipped counter. Extracted from TemplateManager for the
// file budget.
import { T, S } from '../../lib/theme';
import { isImageColumn } from './templateParse';
import type { ListingTemplateField } from '../../types/database';

export default function EditorToolbar({ fields, isSaved, onFields, onReupload, addToast, rulesCount, onRules, query, onQuery }: {
  fields: ListingTemplateField[];
  isSaved: boolean; // editing an already-saved template (enables re-upload)
  onFields: (fields: ListingTemplateField[]) => void;
  onReupload: () => void;
  addToast: (m: string, t?: string) => void;
  rulesCount: number;
  onRules: () => void;
  query: string;
  onQuery: (q: string) => void;
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
      <button onClick={onRules} title='Conditional fills: "WHEN semi-stitched → SET Closure to NA", per-size charts…' style={{ ...S.btnGhost, ...S.btnSm, color: T.ac2, border: '1px solid oklch(0.55 0.22 265 / .35)' }}>⚡ Rules{rulesCount ? ` (${rulesCount})` : ''}</button>
      <span style={{ fontSize: 10, color: T.tx3 }}>{fields.filter(f => f.mandatory).length} mandatory · {fields.filter(f => f.skip).length} skipped</span>
      <span style={{ position: 'relative', flex: 1, minWidth: 130 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.tx3} strokeWidth="1.8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input value={query} onChange={e => onQuery(e.target.value)} placeholder="Search columns…" style={{ ...S.fSearch, width: '100%' }} />
      </span>
    </div>
  );
}

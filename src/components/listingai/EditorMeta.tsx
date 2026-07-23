// Template-editor meta row: name, marketplace, garment category (feeds the
// pre-AI SKU check), data-entry sheet picker. Extracted from TemplateManager
// for the file budget.
import { S } from '../../lib/theme';
import { CATEGORY_OPTIONS } from './categories';

export default function EditorMeta({ name, marketplace, category, sheetName, sheetNames, hasFile, onPatch, onPickSheet, onEnter }: {
  name: string; marketplace: string; category: string; sheetName: string; sheetNames: string[]; hasFile: boolean;
  onPatch: (patch: { name?: string; marketplace?: string; category?: string }) => void;
  onPickSheet: (sheet: string) => void;
  onEnter: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
      <div style={{ flex: 2, minWidth: 160 }}>
        <div style={S.fLabel}>Template name</div>
        <input value={name} onChange={e => onPatch({ name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') onEnter(); }} placeholder="e.g. Myntra Kurta Set" style={{ ...S.fInput, width: '100%' }} />
      </div>
      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={S.fLabel}>Marketplace</div>
        <input value={marketplace} onChange={e => onPatch({ marketplace: e.target.value })} placeholder="Myntra / Ajio / …" style={{ ...S.fInput, width: '100%' }} />
      </div>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={S.fLabel}>Category</div>
        <select value={category} onChange={e => onPatch({ category: e.target.value })}
          title="Garment category — SKUs that look like a different category are flagged before any AI cost"
          style={{ ...S.fInput, width: '100%' }}>
          <option value="">Auto (from name)</option>
          {CATEGORY_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      {hasFile && sheetNames.length > 1 && (
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={S.fLabel}>Data-entry sheet</div>
          <select value={sheetName} onChange={e => onPickSheet(e.target.value)} style={{ ...S.fInput, width: '100%' }}>
            {sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

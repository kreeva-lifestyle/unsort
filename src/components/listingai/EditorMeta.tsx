// Template-editor meta row: name, marketplace, data-entry sheet picker.
// Extracted from TemplateManager for the file budget.
import { S } from '../../lib/theme';

export default function EditorMeta({ name, marketplace, sheetName, sheetNames, hasFile, onPatch, onPickSheet, onEnter }: {
  name: string; marketplace: string; sheetName: string; sheetNames: string[]; hasFile: boolean;
  onPatch: (patch: { name?: string; marketplace?: string }) => void;
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

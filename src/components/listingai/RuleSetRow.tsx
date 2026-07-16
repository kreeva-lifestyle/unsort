// One "SET column …" target inside a rule: pick the column, then either a
// single value (dropdown-constrained when the column has one) or a per-size
// chart (size → value pairs, applied to each expanded size row).
import { T, S } from '../../lib/theme';
import type { ListingTemplateField, ListingTemplateRuleSet } from '../../types/database';

export default function RuleSetRow({ fields, entry, onChange, onRemove }: {
  fields: ListingTemplateField[];
  entry: ListingTemplateRuleSet;
  onChange: (patch: Partial<ListingTemplateRuleSet>) => void;
  onRemove: () => void;
}) {
  const f = fields.find(x => x.header === entry.header);
  const perSize = entry.perSize && Object.keys(entry.perSize).length > 0 ? entry.perSize : null;
  const sizes = perSize ? Object.entries(perSize) : [];

  const setSize = (oldKey: string, key: string, value: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of sizes) next[k === oldKey ? key : k] = k === oldKey ? value : v;
    if (oldKey === '') next[key] = value;
    onChange({ perSize: next, value: '' });
  };
  const dropSize = (key: string) => {
    const next = { ...perSize };
    delete next[key];
    onChange({ perSize: next });
  };

  return (
    <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.bd}` }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: T.tx3, fontWeight: 600 }}>SET</span>
        <select value={entry.header} onChange={e => onChange({ header: e.target.value, value: '', perSize: {} })} style={{ ...S.fInput, flex: '1 1 150px', minWidth: 130 }}>
          <option value="">column…</option>
          {fields.map(x => <option key={x.header} value={x.header}>{x.header}</option>)}
        </select>
        <span style={{ fontSize: 10, color: T.tx3 }}>to</span>
        {!perSize && (f?.allowed?.length ? (
          <select value={entry.value || ''} onChange={e => onChange({ value: e.target.value, perSize: {} })} style={{ ...S.fInput, flex: '1 1 140px', minWidth: 120 }}>
            <option value="">value…</option>
            {f.allowed.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        ) : (
          <input value={entry.value || ''} onChange={e => onChange({ value: e.target.value, perSize: {} })} placeholder="value" style={{ ...S.fInput, flex: '1 1 140px', minWidth: 120 }} />
        ))}
        <button onClick={() => perSize ? onChange({ perSize: {}, value: '' }) : onChange({ perSize: { '': '' }, value: '' })}
          title="Different value per size row (size chart)"
          style={{ ...S.btnGhost, ...S.btnSm, color: perSize ? T.ac2 : T.tx3 }}>
          {perSize ? 'per size ✓' : 'per size…'}
        </button>
        <button onClick={onRemove} style={{ ...S.btnGhost, ...S.btnSm, color: T.re }}>&#215;</button>
      </div>
      {perSize && (
        <div style={{ marginTop: 6, paddingLeft: 26 }}>
          {sizes.map(([k, v], i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <input value={k} onChange={e => setSize(k, e.target.value, v)} placeholder="size (e.g. S)" style={{ ...S.fInput, width: 110 }} />
              <span style={{ fontSize: 10, color: T.tx3 }}>&#8594;</span>
              {f?.allowed?.length ? (
                <select value={v} onChange={e => setSize(k, k, e.target.value)} style={{ ...S.fInput, flex: 1, minWidth: 110 }}>
                  <option value="">value…</option>
                  {f.allowed.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              ) : (
                <input value={v} onChange={e => setSize(k, k, e.target.value)} placeholder="value (e.g. 28)" style={{ ...S.fInput, flex: 1, minWidth: 110 }} />
              )}
              <button onClick={() => dropSize(k)} style={{ ...S.btnGhost, ...S.btnSm, color: T.re }}>&#215;</button>
            </div>
          ))}
          <button onClick={() => onChange({ perSize: { ...perSize, '': '' } })} style={{ ...S.btnGhost, ...S.btnSm }}>+ size</button>
          <span style={{ fontSize: 10, color: T.tx3, marginLeft: 8 }}>sizes without a row keep their normal value</span>
        </div>
      )}
    </div>
  );
}

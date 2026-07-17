// Conditional rules for one template: "WHEN a product matches → SET
// columns". Rules run in code on every generation — zero AI cost — and
// overwrite the AI's pick, so semi-stitched vs stitched products can fill
// measurement/closure columns differently. Values are always validated
// against each column's dropdown server-side.
import { T, S } from '../../lib/theme';
import { SENSITIVE_RE } from './templateParse';
import RuleSetRow from './RuleSetRow';
import type { ListingTemplateField, ListingTemplateRule } from '../../types/database';

const condOf = (r: ListingTemplateRule) => r.source === 'always' ? 'always' : `${r.source}:${r.key}`;

export default function RulesEditor({ fields, masterCols, rules, onChange, onBack }: {
  fields: ListingTemplateField[];
  masterCols: string[];
  rules: ListingTemplateRule[];
  onChange: (rules: ListingTemplateRule[]) => void;
  onBack: () => void;
}) {
  const targetable = fields.filter(f => !f.skip && !SENSITIVE_RE.test(f.header));
  const patchRule = (i: number, patch: Partial<ListingTemplateRule>) =>
    onChange(rules.map((r, ix) => ix === i ? { ...r, ...patch } : r));

  return (
    <div>
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 8, lineHeight: 1.5 }}>
        Rules fill columns <b>your way</b> when a product matches — e.g. WHEN the master SIZE contains "semi-stitched" → SET Closure to NA. They cost nothing and always win over the AI. "Per size" values apply to each size row (S → 28, M → 30…). Values can use <b>{'{sku}'}</b> and <b>{'{size}'}</b>: set a child-code column to <b>{'{sku}-{size}'}</b> (→ XYZ-XS, XYZ-S… per size row) and the parent-code column to <b>{'{sku}'}</b>.
      </div>
      <div style={{ maxHeight: '38vh', overflowY: 'auto' }}>
        {rules.length === 0 && (
          <div style={{ padding: '24px 10px', textAlign: 'center', color: T.tx3, fontSize: 11 }}>
            No rules yet — add one below.
          </div>
        )}
        {rules.map((r, i) => (
          <div key={i} style={{ border: `1px solid ${T.bd}`, borderRadius: 8, marginBottom: 8, background: 'rgba(255,255,255,0.01)' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px' }}>
              <span style={{ fontSize: 10, color: T.ac2, fontWeight: 700 }}>WHEN</span>
              <select value={condOf(r)} onChange={e => {
                const v = e.target.value;
                if (v === 'always') patchRule(i, { source: 'always', key: '', value: '' });
                else { const ix = v.indexOf(':'); patchRule(i, { source: v.slice(0, ix) as 'master' | 'column', key: v.slice(ix + 1) }); }
              }} style={{ ...S.fInput, flex: '1 1 170px', minWidth: 150 }}>
                <option value="always">every product (always)</option>
                {masterCols.length > 0 && <optgroup label="Master sheet column">
                  {masterCols.map(c => <option key={`m${c}`} value={`master:${c}`}>&#10515; {c}</option>)}
                </optgroup>}
                <optgroup label="This sheet's column (as generated)">
                  {targetable.map(f => <option key={`c${f.header}`} value={`column:${f.header}`}>{f.header}</option>)}
                </optgroup>
              </select>
              {r.source !== 'always' && <>
                <select value={r.op} onChange={e => patchRule(i, { op: e.target.value as 'is' | 'contains' })} style={{ ...S.fInput, width: 92 }}>
                  <option value="is">is</option>
                  <option value="contains">contains</option>
                </select>
                <input value={r.value} onChange={e => patchRule(i, { value: e.target.value })} placeholder='e.g. Semi-Stitched' style={{ ...S.fInput, flex: '1 1 130px', minWidth: 110 }} />
              </>}
              <button onClick={() => onChange(rules.filter((_, ix) => ix !== i))} title="Remove this rule" style={{ ...S.btnDanger, ...S.btnSm }}>Remove</button>
            </div>
            {r.set.map((s, si) => (
              <RuleSetRow key={si} fields={targetable} entry={s}
                onChange={patch => patchRule(i, { set: r.set.map((x, xi) => xi === si ? { ...x, ...patch } : x) })}
                onRemove={() => patchRule(i, { set: r.set.filter((_, xi) => xi !== si) })} />
            ))}
            <div style={{ padding: '6px 10px', borderTop: `1px solid ${T.bd}` }}>
              <button onClick={() => patchRule(i, { set: [...r.set, { header: '', value: '', perSize: {} }] })} style={{ ...S.btnGhost, ...S.btnSm }}>+ set another column</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => onChange([...rules, { source: 'always', key: '', op: 'is', value: '', set: [{ header: '', value: '', perSize: {} }] }])} style={S.btnGhost}>+ Add rule</button>
        <button onClick={onBack} style={{ ...S.btnPrimary, marginLeft: 'auto' }}>Done — back to columns</button>
      </div>
    </div>
  );
}

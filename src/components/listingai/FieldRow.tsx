// One template-field row in the editor: mandatory toggle, dropdown-options
// chip, fixed-value control (select when the marketplace fixed the choices,
// free text + hint otherwise). Kept out of TemplateManager for the file
// budget.
import { T, S } from '../../lib/theme';
import { SENSITIVE_RE } from './templateParse';
import type { ListingTemplateField } from '../../types/database';

export default function FieldRow({ f, others, onChange, addToast }: {
  f: ListingTemplateField;
  others: string[]; // headers this column may be wired to (excl. self/wired/skipped/sensitive)
  onChange: (patch: Partial<ListingTemplateField>) => void;
  addToast: (m: string, t?: string) => void;
}) {
  if (SENSITIVE_RE.test(f.header)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${T.bd}`, opacity: 0.5 }}>
        <span style={{ fontSize: 12, color: T.tx3, flex: 1 }}>{f.header}</span>
        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(239,68,68,.1)', color: T.re }}>always blank</span>
      </div>
    );
  }
  // Skipped: the owner never wants this column filled - exported empty.
  // A skipped MANDATORY column is a marketplace rejection waiting to happen,
  // so its badge goes red.
  if (f.skip) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${T.bd}`, opacity: f.mandatory ? 0.75 : 0.45 }}>
        <span style={{ fontSize: 12, color: T.tx3, flex: 1, textDecoration: 'line-through' }}>{f.header}</span>
        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: f.mandatory ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.06)', color: f.mandatory ? T.re : T.tx3 }}>
          {f.mandatory ? 'MANDATORY skipped — exported empty' : 'skipped — left empty'}
        </span>
        <button onClick={() => onChange({ skip: false })} style={{ ...S.btnGhost, ...S.btnSm }}>Fill</button>
      </div>
    );
  }
  // Wired: copies another column's final value on every run — zero AI cost.
  if (f.sameAs) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${T.bd}` }}>
        <input type="checkbox" checked={f.mandatory} onChange={e => onChange({ mandatory: e.target.checked })} title="Mandatory" style={{ width: 15, height: 15, accentColor: T.ac, cursor: 'pointer', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: T.tx2, flex: 1, minWidth: 90, wordBreak: 'break-word' }}>{f.header}</span>
        <span title="Copies that column's value on every run — no AI cost" style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(56,189,248,.1)', color: T.bl }}>= copies "{f.sameAs}"</span>
        <button onClick={() => onChange({ sameAs: '' })} style={{ ...S.btnGhost, ...S.btnSm }}>Unlink</button>
      </div>
    );
  }
  const nAllowed = f.allowed?.length || 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${T.bd}` }}>
      <input type="checkbox" checked={f.mandatory} onChange={e => onChange({ mandatory: e.target.checked })} title="Mandatory" style={{ width: 15, height: 15, accentColor: T.ac, cursor: 'pointer', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: T.tx2, flex: 1, minWidth: 90, wordBreak: 'break-word' }}>{f.header}</span>
      {nAllowed > 0 && (
        <span onClick={() => addToast(`${f.header}: ${f.allowed!.slice(0, 15).join(', ')}${nAllowed > 15 ? ` … +${nAllowed - 15} more` : ''}`, 'success')}
          title={f.allowed!.slice(0, 30).join(', ')}
          style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(34,197,94,.1)', color: T.gr, cursor: 'pointer', flexShrink: 0 }}>
          {nAllowed} options
        </span>
      )}
      {nAllowed > 0 ? (
        <select value={f.fixed || ''} onChange={e => onChange({ fixed: e.target.value })}
          title="Fixed value — used on every run, no AI cost"
          style={{ ...S.fInput, width: '38%', height: 30, fontSize: 12, color: f.fixed ? T.ac2 : T.tx3 }}>
          <option value="">AI picks per product</option>
          {f.allowed!.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      ) : (
        <span style={{ display: 'flex', gap: 4, width: '44%', flexShrink: 0 }}>
          <input value={f.fixed || ''} onChange={e => onChange({ fixed: e.target.value })} placeholder="fixed value" title="Fixed value — used on every run, no AI cost" style={{ ...S.fInput, width: '55%', height: 30, fontSize: 12, color: f.fixed ? T.ac2 : undefined }} />
          <input value={f.hint} onChange={e => onChange({ hint: e.target.value })} placeholder="hint" style={{ ...S.fInput, width: '45%', height: 30, fontSize: 12 }} />
        </span>
      )}
      {others.length > 0 && (
        <select value="" onChange={e => {
          if (!e.target.value) return;
          onChange({ sameAs: e.target.value, fixed: '' });
          addToast(`"${f.header}" will copy "${e.target.value}" on every run — no AI cost`, 'success');
        }} title="Wire — copy another column's value on every run" style={{ ...S.fInput, width: 36, height: 30, fontSize: 12, color: T.tx3, padding: '4px 4px', flexShrink: 0 }}>
          <option value="">&#8646;</option>
          {others.map(h => <option key={h} value={h}>= {h}</option>)}
        </select>
      )}
      <button onClick={() => {
        if (f.mandatory) addToast(`"${f.header}" is marked mandatory — the marketplace requires it, but it will be exported EMPTY while skipped`, 'error');
        onChange({ skip: true });
      }} title="Skip — never fill this column" style={{ ...S.btnGhost, ...S.btnSm, padding: '4px 7px', color: T.tx3, flexShrink: 0 }}>&#215;</button>
    </div>
  );
}

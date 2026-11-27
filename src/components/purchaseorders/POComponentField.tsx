// "Fabric is for" on a fabric PO line (owner, 27 Nov 2026): which part of the
// design this fabric is bought for, so the next person knows whether it is
// the dupatta, the top, the lehenga or the blouse. The chips are the master
// sheet's INCLUDES for the line's SKU (the list Jobwork's "Component sent"
// offers); one fabric for two parts lights two chips ("LEHENGA, BLOUSE"). A
// design the sheet does not know, or a part it does not list, is typed.
// Compulsory on a fabric line — poFormSave, and the RPCs agree.
import { useState } from 'react';
import { T, S } from '../../lib/theme';
import { useProductCatalog, resolveSku } from '../../hooks/useProductCatalog';
import { mergeComponents, sameComponent } from '../../lib/componentNames';

const split = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean);
/** As it is saved: capitals, no blanks, no repeats — "lehenga , Blouse" → "LEHENGA, BLOUSE". */
export const cleanComponent = (v: string): string => [...new Set(split(v).map(s => s.toUpperCase()))].join(', ');

export default function POComponentField({ sku, value, onChange, missing }: {
  sku: string;
  value: string;
  onChange: (v: string) => void;
  /** Save was tried without it: the label turns red. */
  missing: boolean;
}) {
  const { index, error } = useProductCatalog();
  const design = resolveSku(index, sku)?.product;
  const options = mergeComponents(design?.includes ?? [], []).map(c => c.toUpperCase());
  const parts = split(value);
  const lit = (c: string) => parts.some(p => sameComponent(p, c));
  const [typing, setTyping] = useState(false);
  // The box shows when there is nothing to tap, when asked for, or when the value holds a part the chips do not offer.
  const box = options.length === 0 || typing || parts.some(p => !options.some(o => sameComponent(o, p)));
  const toggle = (c: string) => onChange((lit(c) ? parts.filter(p => !sameComponent(p, c)) : [...parts, c]).join(', '));
  const note = options.length > 0 ? ''
    : error ? 'The SKU list could not be loaded — type the part'
    : !index ? 'Loading this design’s parts…'
    : design ? `The master sheet lists no parts for ${design.sku} — type the part`
    : sku.trim().length >= 3 ? `${sku.trim().toUpperCase()} is not in the master sheet — type the part`
    : 'Enter the SKU above to pick from its parts, or type it';
  const chip = (on: boolean): React.CSSProperties => ({ ...S.btnGhost, ...S.btnSm, minHeight: 32, borderRadius: 999, padding: '5px 12px', fontSize: 11, ...(on ? { borderColor: T.ac, color: T.ac2, background: T.ac3 } : {}) });
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ ...S.fLabel, marginBottom: 4, color: missing ? T.re : T.tx3 }}>Fabric is for *</div>
      {options.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: box ? 6 : 0 }}>
          {options.map(c => <button key={c} type="button" className="touch44" onClick={() => toggle(c)} aria-pressed={lit(c)} style={chip(lit(c))}>{c}</button>)}
          {!box && <button type="button" className="touch44" onClick={() => setTyping(true)} style={chip(false)}>Other…</button>}
        </div>
      )}
      {box && <input value={value} onChange={e => onChange(e.target.value)} aria-label="Fabric is for" autoCapitalize="characters"
        placeholder={options.length > 0 ? 'or type — e.g. LEHENGA, BLOUSE for two parts' : 'e.g. DUPATTA, TOP, LEHENGA'} style={{ ...S.fInput, width: '100%', minWidth: 0 }} />}
      {note && <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

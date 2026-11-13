// Inside the import sheet, under the choices: the manufacturers "Check website" found, each a chip that is on
// (imported) until tapped off (owner, 2026-11-13: "ability to ignore those manufacturer which we want to while
// scrapping products"). The run passes over a product that names an unticked one (pb-products import/maker.ts
// skipsMaker); products that name no manufacturer are always imported. The choice is remembered for this website:
// the next check starts with it, and a remembered name the check did not see this time still shows (and applies).
import type { ImportMaker } from '../../../data/imports';
import { pbLabel, pbMeta, pbNum } from '../../../pbTheme';
import { PbChip, PbChipRow } from '../../ui';

/** Names compared as the server does: case, accents, spaces and punctuation aside. */
const key = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '');

export default function MakerSkip({ maker, skip, onChange, disabled }: {
  maker: ImportMaker | null | undefined; skip: string[]; onChange: (skip: string[]) => void; disabled?: boolean;
}) {
  const found = maker?.names ?? [];
  const all = [...found, ...skip.filter(s => !found.some(f => key(f.name) === key(s))).map(name => ({ name, products: 0 }))];
  if (!all.length) return null;
  const off = new Set(skip.map(key));
  const toggle = (name: string) => onChange(off.has(key(name)) ? skip.filter(s => key(s) !== key(name)) : [...skip, name]);
  const left = all.filter(f => off.has(key(f.name)));
  const about = left.reduce((n, f) => n + f.products, 0);
  return (
    <div style={{ minWidth: 0 }}>
      <span style={pbLabel}>Manufacturers to import</span>
      <PbChipRow label="Manufacturers to import: tap one to leave its products out">
        {all.map(f => (
          <PbChip key={f.name} pressed={!off.has(key(f.name))} count={f.products || undefined} disabled={disabled} onClick={() => toggle(f.name)} title={f.name}>
            <span style={{ display: 'inline-block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{f.name}</span>
          </PbChip>
        ))}
      </PbChipRow>
      <div style={{ ...pbMeta, marginTop: 8 }}>
        {left.length
          ? <>Leaving out {left.map(f => f.name).join(', ')}{about ? <> (about <span style={pbNum}>{about.toLocaleString('en-IN')}</span> of the products checked)</> : null}. </>
          : 'Tap a manufacturer to leave its products out. '}
        Products that name no manufacturer are always imported. Remembered for this website.
      </div>
    </div>
  );
}

// The choices under the preview: the vendor, "Only in-stock products" and
// "Sell at their price", each switch row with the consequence spelled out
// (copy-and-a11y.md §A4). A store pricing in another currency (`foreign`)
// gets no price switch: nothing is copied.
// The vendor is optional (owner, 2026-11-13: "vendor not mandatory while
// scrapping from website"): left empty, the products come in without one and
// it can be set on any product later. A website imported before is not asked
// again — the vendor of its latest import is shown as a line with Change (and
// none if that import had none). On a first import the box starts empty and the
// vendors already in Playbook are offered as chips, because the stores copied
// here sell the products of vendors the owner already knows: one tap instead
// of typing, and no second vendor from a typo. (Until 2026-11-13 the box was
// required and prefilled with the website's own name.)
import { useState, type ReactNode } from 'react';
import { PB, pbInput, pbLabel, pbMeta, pbName } from '../../../pbTheme';
import PbButton from '../../ui/PbButton';
import { PbChip, PbChipRow } from '../../ui/PbChip';
import PbSwitch from '../../ui/PbSwitch';

/** `skip`: manufacturers to leave out (MakerSkip). */
export type ImportChoices = { vendor: string; inStockOnly: boolean; theirPrice: boolean; skip: string[] };

function SwitchRow({ title, hint, on, onToggle, label }: { title: string; hint: ReactNode; on: boolean; onToggle: () => void; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, padding: '8px 0' }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={pbName}>{title}</span>
        <span style={pbMeta}>{hint}</span>
      </span>
      <PbSwitch on={on} label={label} onToggle={onToggle} />
    </div>
  );
}

/** Up to 8 vendors already in Playbook that fit what is typed (all of them while the box holds the site's own name). */
export function vendorChoices(vendors: string[], typed: string, suggested: string): string[] {
  const t = typed.trim().toLowerCase();
  const fits = !t || t === suggested.trim().toLowerCase() ? vendors : vendors.filter(v => v.toLowerCase().includes(t));
  return fits.filter(v => v.toLowerCase() !== t).slice(0, 8);
}

export default function ImportOptions({ value, onChange, disabled, foreign, lastVendor, suggested = '', vendors = [] }: {
  value: ImportChoices; onChange: (v: ImportChoices) => void; disabled?: boolean; foreign?: string | null;
  /** The vendor this website's last import was filed under: shown instead of asking again. */
  lastVendor?: string | null;
  /** The name read from the site (what the box is prefilled with on a first import). */
  suggested?: string;
  /** Vendors already in Playbook, by name. */
  vendors?: string[];
}) {
  const set = (p: Partial<ImportChoices>) => onChange({ ...value, ...p });
  const [changing, setChanging] = useState(false);
  const kept = !!lastVendor && !changing && value.vendor === lastVendor;
  const picks = kept ? [] : vendorChoices(vendors, value.vendor, suggested);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: disabled ? 0.6 : 1 }}>
      {kept ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={pbLabel}>Vendor</span>
            <span style={{ ...pbName, overflowWrap: 'anywhere' }}>{lastVendor}</span>
            <span style={pbMeta}>Same vendor as the last import from this website.</span>
          </span>
          <PbButton onClick={() => !disabled && setChanging(true)} aria-label="Change the vendor">Change</PbButton>
        </div>
      ) : (
        <div style={{ minWidth: 0 }}>
          <label htmlFor="pb-imp-vendor" style={pbLabel}>Vendor (optional)</label>
          <input id="pb-imp-vendor" value={value.vendor} onChange={e => set({ vendor: e.target.value })} maxLength={120} disabled={disabled}
            placeholder="e.g. Kalki Fashion" autoCapitalize="words" enterKeyHint="done" className="pb-input" style={pbInput}
            aria-describedby="pb-imp-vendor-hint" />
          {picks.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <PbChipRow label="Vendors already in Playbook">
                {picks.map(v => <PbChip key={v} onClick={() => !disabled && set({ vendor: v })}>{v}</PbChip>)}
              </PbChipRow>
            </div>
          )}
          <div id="pb-imp-vendor-hint" style={{ ...pbMeta, marginTop: 8 }}>
            Who makes these products. Leave it empty if you don’t know: they come in without a vendor, and you can set one on any product later. Tap one of your vendors or type a name — Playbook remembers it for this website.
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${PB.tileBd}` }}>
        <SwitchRow title="Only in-stock products" label="Only in-stock products" on={value.inStockOnly} onToggle={() => !disabled && set({ inStockOnly: !value.inStockOnly })}
          hint={value.inStockOnly ? 'Products the store shows as sold out are left out.' : 'Sold-out products are copied too.'} />
        {foreign ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', minWidth: 0 }}>
            <span style={pbName}>Their price is not copied</span>
            <span style={pbMeta}>Prices on this store are in {foreign}, so no price is copied. Each product waits in Needs info until you add a cost price.</span>
          </div>
        ) : (
          <SwitchRow title="Sell at their price" label="Sell at their price" on={value.theirPrice} onToggle={() => !disabled && set({ theirPrice: !value.theirPrice })}
            hint={value.theirPrice ? 'Their price (in rupees) becomes our selling price on every website. The pricing rules are skipped. Prices in another currency are not copied.'
              : 'No price is copied. Each product waits in Needs info until you add a cost price.'} />
        )}
      </div>
    </div>
  );
}

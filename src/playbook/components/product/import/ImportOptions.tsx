// The choices under the preview: vendor name (prefilled from the site,
// editable), "Only in-stock products" and "Sell at their price", each a
// switch row with the consequence spelled out (copy-and-a11y.md §A4). A store
// pricing in another currency (`foreign`) gets no price switch: nothing is copied.
import type { ReactNode } from 'react';
import { PB, pbInput, pbLabel, pbMeta, pbName } from '../../../pbTheme';
import PbSwitch from '../../ui/PbSwitch';

export type ImportChoices = { vendor: string; inStockOnly: boolean; theirPrice: boolean };

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

export default function ImportOptions({ value, onChange, disabled, vendorError, foreign }: {
  value: ImportChoices; onChange: (v: ImportChoices) => void; disabled?: boolean; vendorError?: string; foreign?: string | null;
}) {
  const set = (p: Partial<ImportChoices>) => onChange({ ...value, ...p });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: disabled ? 0.6 : 1 }}>
      <div style={{ minWidth: 0 }}>
        <label htmlFor="pb-imp-vendor" style={pbLabel}>Vendor name</label>
        <input id="pb-imp-vendor" value={value.vendor} onChange={e => set({ vendor: e.target.value })} maxLength={120} disabled={disabled}
          placeholder="e.g. Kalki Fashion" autoCapitalize="words" enterKeyHint="done" className="pb-input" style={pbInput}
          aria-describedby="pb-imp-vendor-hint" aria-invalid={vendorError ? true : undefined} />
        <div id="pb-imp-vendor-hint" style={{ ...pbMeta, marginTop: 8 }}>
          {vendorError ? <span style={{ color: PB.failed }}>{vendorError}</span> : 'Every imported product gets this vendor. A new vendor is made if there is none with this name.'}
        </div>
      </div>
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

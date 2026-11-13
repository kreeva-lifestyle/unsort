// One value as a chip on the Tags page (AttributesTile, ScopedValues): its name, "+N" for its also-known-as words and
// how many products carry it; tap → its sheet. `warn`: review-tinted border plus a spoken note (a Product Type value
// ticked for no category).
import type { PbAttrValue } from '../../tagTypes';
import { PB, pbBtnSecondary, pbMeta, pbNum } from '../../pbTheme';
import { plural } from './tagText';

export const CHIP = { ...pbBtnSecondary, minHeight: 'var(--pb-chip-h)', padding: '4px 14px', borderRadius: PB.r.pill, fontWeight: 500, gap: 8, maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left' } as const;
export const CHIP_LIST = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 } as const;
export const CHIP_ITEM = { minWidth: 0, maxWidth: '100%', display: 'flex' } as const;

export default function ValueChip({ v, onOpen, disabled, warn }: { v: PbAttrValue; onOpen: () => void; disabled?: boolean; warn?: string }) {
  return (
    <button type="button" className="pb-pill" style={{ ...CHIP, ...(warn ? { borderColor: PB.reviewBd } : null) }} onClick={onOpen} disabled={disabled}
      aria-label={`${v.name}, ${plural(v.uses ?? 0, 'product')}${v.aliases.length ? `, also known as ${v.aliases.join(', ')}` : ''}${warn ? `, ${warn}` : ''}`}>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{v.name}</span>
      {v.aliases.length > 0 && <span style={{ ...pbMeta, whiteSpace: 'nowrap' }}>+{v.aliases.length}</span>}
      <span style={{ ...pbNum, ...pbMeta }}>{v.uses ?? 0}</span>
    </button>
  );
}

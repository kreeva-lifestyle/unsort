// One-tap chips of the LAST 5 ITEM NAMES on the PO form (owner's ask),
// shown under an item-name box that is still empty. Scoped to the chosen
// PO type (fabric names are not job-work names); deduped case-insensitively
// by po_recent_item_names so "micro" / "Micro" never appear twice. One
// small query per form open (and per type change), never per card.
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import { S } from '../../lib/theme';
import type { PurchaseOrderType } from '../../types/database';

export function useRecentItemNames(poType: PurchaseOrderType | ''): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    supabase.rpc('po_recent_item_names', { p_type: poType || null, p_limit: 5 }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { logSwallowed('PO recent item names', error); return; } // chips are a convenience
      setNames(((data as string[] | null) || []).filter(Boolean));
    });
    return () => { alive = false; };
  }, [poType]);
  return names;
}

export default function ItemNameChips({ names, onPick }: { names: string[]; onPick: (name: string) => void }) {
  if (names.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: -2, marginBottom: 8 }}>
      {names.map(n => (
        <button key={n} type="button" className="touch44" onClick={() => onPick(n)} aria-label={`Use item name ${n}`}
          style={{ ...S.btnGhost, ...S.btnSm, minHeight: 30, padding: '4px 12px', fontSize: 11, borderRadius: 999 }}>
          {n}
        </button>
      ))}
    </div>
  );
}

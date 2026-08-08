// Master-sheet IMAGE-column saves for the Link Generator (single + bulk),
// extracted from DropboxLinkGenerator.tsx for the file budget. Combine-mode
// folder links only — the callers gate that.
import { useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { call, WriteResult } from './api';
import { BulkRow } from './bulk';

export function useSheetSave(addToast: (m: string, t?: string) => void) {
  const [savingSheet, setSavingSheet] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const saveToSheet = async (url: string, sku0: string) => {
    if (savingSheet) return; setSavingSheet(true);
    try {
      const { data } = await call({ action: 'linkgen_writesheet', items: [{ sku: sku0, url }] }) as { data: WriteResult };
      if (data.ok) addToast(`Saved to ${data.written?.[0]?.tab || 'sheet'} ${data.written?.[0]?.cell?.split('!')[1] || ''}`.trim(), 'success');
      else if (data.error === 'sku_not_found') addToast(`${sku0} is not in the master sheet`, 'error');
      else if (data.error === 'sku_ambiguous') addToast(`${sku0} exists in BOTH master tabs — update the sheet manually to be safe`, 'error');
      else addToast(friendlyError(data.error || 'Could not save to the sheet'), 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSavingSheet(false);
  };

  const saveAllToSheet = async (bulk: BulkRow[] | null) => {
    if (bulkSaving || !bulk) return;
    const items = bulk.filter(r => r.status === 'ok' && r.links[0]?.url).map(r => ({ sku: r.sku, url: r.links[0].url }));
    if (!items.length) { addToast('No folder links to save', 'error'); return; }
    setBulkSaving(true);
    try {
      const { data } = await call({ action: 'linkgen_writesheet', items }) as { data: WriteResult };
      const skipped = [
        data.notFound?.length ? `${data.notFound.length} not in sheet` : '',
        data.ambiguous?.length ? `${data.ambiguous.length} in both tabs (skipped: ${data.ambiguous.join(', ')})` : '',
      ].filter(Boolean).join(' · ');
      if (data.ok) addToast(`Saved ${data.skuCount ?? data.count} SKU${(data.skuCount ?? data.count) === 1 ? '' : 's'} to the master sheet${skipped ? ` — ${skipped}` : ''}`, 'success');
      else if (data.error === 'sku_not_found' || data.error === 'sku_ambiguous') addToast(`Nothing saved — ${skipped || 'no matching SKUs in the master sheet'}`, 'error');
      else addToast(friendlyError(data.error || 'Could not save to the sheet'), 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBulkSaving(false);
  };

  return { savingSheet, bulkSaving, saveToSheet, saveAllToSheet };
}

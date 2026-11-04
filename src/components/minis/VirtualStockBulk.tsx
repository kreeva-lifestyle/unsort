// Bulk change for Virtual Stock Override (owner, 2026-11-04): pick SKUs (the
// ticked ones, or everything the search shows) and set / add / subtract a
// quantity or remove them in one go — or paste "SKU qty" lines from Excel.
// Writes are single statements per batch: update … in (ids), upsert on the
// unique sku, delete … in (ids). A quantity that reaches 0 removes the SKU.
import { useState } from 'react';
import { supabase, currentUserId } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';

type Row = { id: string; sku: string; quantity: number };
type Action = 'set' | 'add' | 'sub' | 'remove';
const BATCH = 200;
const chunks = <X,>(a: X[]) => Array.from({ length: Math.ceil(a.length / BATCH) }, (_, i) => a.slice(i * BATCH, (i + 1) * BATCH));

/** "SKU qty" per line — tab, comma, space or '=' between; header lines and blanks skipped. */
export function parsePaste(text: string): { list: { sku: string; qty: number }[]; bad: string[] } {
  const list = new Map<string, number>();
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\S+)[\s,;=]+(-?\d+)\s*$/);
    if (!m) { if (!/sku/i.test(line)) bad.push(line); continue; }
    const q = parseInt(m[2], 10);
    if (q < 0) { bad.push(line); continue; }
    list.set(m[1].toUpperCase(), q);
  }
  return { list: [...list].map(([sku, qty]) => ({ sku, qty })), bad };
}

export default function VirtualStockBulk({ rows, shown, selected, onSelect, onClear, onDone, ask, addToast }: {
  rows: Row[]; shown: Row[]; selected: Set<string>;
  onSelect: (ids: Set<string>) => void; onClear: () => void; onDone: () => void;
  ask: (o: { title: string; message?: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  addToast: (m: string, t?: string) => void;
}) {
  const [action, setAction] = useState<Action>('set');
  const [qty, setQty] = useState('');
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const target = selected.size ? rows.filter(r => selected.has(r.id)) : shown;
  const scope = selected.size ? `${selected.size} ticked` : `all ${shown.length} shown`;
  // Select all = every SKU the search shows (all pages); tapping again unticks them.
  const allTicked = shown.length > 0 && shown.every(r => selected.has(r.id));
  const someTicked = !allTicked && shown.some(r => selected.has(r.id));
  const toggleAll = () => {
    const n = new Set(selected);
    for (const r of shown) { if (allTicked) n.delete(r.id); else n.add(r.id); }
    onSelect(n);
  };

  const run = async (label: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await work(); addToast(label, 'success'); onClear(); onDone(); }
    catch (e) { addToast('Bulk change failed — ' + friendlyError(e), 'error'); onDone(); }
    finally { setBusy(false); }
  };
  const del = async (ids: string[]) => { for (const c of chunks(ids)) { const { error } = await supabase.from('virtual_stock').delete().in('id', c); if (error) throw error; } };
  // Existing SKUs: upsert on the unique sku (only quantity/updated_at change);
  // new SKUs: insert with who added them.
  const upsert = async (list: { sku: string; quantity: number }[]) => {
    const have = new Set(rows.map(r => r.sku));
    const now = new Date().toISOString();
    for (const c of chunks(list.filter(r => have.has(r.sku)))) {
      const { error } = await supabase.from('virtual_stock').upsert(c.map(r => ({ ...r, updated_at: now })), { onConflict: 'sku' });
      if (error) throw error;
    }
    const fresh = list.filter(r => !have.has(r.sku));
    if (!fresh.length) return;
    const uid = await currentUserId();
    for (const c of chunks(fresh)) {
      const { error } = await supabase.from('virtual_stock').insert(c.map(r => ({ ...r, created_by: uid })));
      if (error) throw error;
    }
  };

  const apply = async () => {
    if (!target.length) { addToast('Nothing to change — tick SKUs or search first', 'error'); return; }
    const q = parseInt(qty, 10);
    if (action !== 'remove' && !(q >= 0)) { addToast('Enter a quantity', 'error'); return; }
    if (action === 'remove' || (action === 'set' && q === 0)) {
      if (!await ask({ title: `Remove ${target.length} SKU${target.length === 1 ? '' : 's'}?`, message: `${scope}: ${target.slice(0, 6).map(r => r.sku).join(', ')}${target.length > 6 ? '…' : ''}`, confirmLabel: 'Remove', danger: true })) return;
      return run(`Removed ${target.length} SKUs`, () => del(target.map(r => r.id)));
    }
    const next = target.map(r => ({ r, n: action === 'set' ? q : action === 'add' ? r.quantity + q : r.quantity - q }));
    const zero = next.filter(x => x.n <= 0);
    const verb = action === 'set' ? `Set to ${q}` : action === 'add' ? `Add ${q}` : `Subtract ${q}`;
    if (!await ask({ title: `${verb} — ${target.length} SKU${target.length === 1 ? '' : 's'}?`, message: `${scope}${zero.length ? `. ${zero.length} would reach 0 and be removed.` : ''}`, confirmLabel: 'Apply' })) return;
    return run(`${verb}: ${target.length} SKUs updated${zero.length ? `, ${zero.length} removed` : ''}`, async () => {
      await upsert(next.filter(x => x.n > 0).map(x => ({ sku: x.r.sku, quantity: x.n })));
      if (zero.length) await del(zero.map(x => x.r.id));
    });
  };

  const applyPaste = async () => {
    const { list, bad } = parsePaste(paste);
    if (!list.length) { addToast(bad.length ? `Could not read: ${bad.slice(0, 3).join(' | ')}` : 'Paste lines like "14001-L 5"', 'error'); return; }
    const bySku = new Map(rows.map(r => [r.sku, r]));
    const gone = list.filter(x => x.qty === 0 && bySku.has(x.sku)).map(x => bySku.get(x.sku)!.id);
    const keep = list.filter(x => x.qty > 0);
    const isNew = keep.filter(x => !bySku.has(x.sku)).length;
    if (!await ask({ title: `Apply ${list.length} lines?`, message: `${keep.length - isNew} updated, ${isNew} new, ${gone.length} removed (qty 0).${bad.length ? ` ${bad.length} unreadable line${bad.length === 1 ? '' : 's'} skipped.` : ''}`, confirmLabel: 'Apply' })) return;
    return run(`Pasted list applied — ${keep.length} set, ${gone.length} removed`, async () => {
      await upsert(keep.map(x => ({ sku: x.sku, quantity: x.qty })));
      if (gone.length) await del(gone);
      setPaste(''); setShowPaste(false);
    });
  };

  const sel = { padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, background: 'rgba(255,255,255,.04)', border: `1px solid ${T.bd}`, color: T.tx, outline: 'none' } as const;
  return (
    <div style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8, padding: '8px 10px', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minHeight: 28 }}>
          <input type="checkbox" checked={allTicked} ref={el => { if (el) el.indeterminate = someTicked; }} onChange={toggleAll} aria-label="Select all shown SKUs" style={{ width: 16, height: 16, accentColor: T.ac, cursor: 'pointer' }} />
          <span style={{ fontSize: 11, color: T.tx2 }}>Select all ({shown.length})</span>
        </label>
        <span style={{ ...S.fLabel, marginBottom: 0 }}>Bulk change</span>
        <span style={{ fontSize: 11, color: selected.size ? T.ac2 : T.tx3 }}>{scope}</span>
        {selected.size > 0 && <button type="button" onClick={onClear} style={{ ...S.btnSm, border: `1px solid ${T.bd2}`, background: 'transparent', color: T.tx3, cursor: 'pointer' }}>Clear ticks</button>}
        <span style={{ flex: 1 }} />
        <select value={action} onChange={e => setAction(e.target.value as Action)} style={sel} aria-label="Bulk action">
          <option value="set">Set to</option><option value="add">Add</option><option value="sub">Subtract</option><option value="remove">Remove</option>
        </select>
        {action !== 'remove' && <input type="number" min="0" step="1" value={qty} onChange={e => setQty(e.target.value)} onKeyDown={e => { numericKeyDown(e); if (e.key === 'Enter') apply(); }} placeholder="Qty" aria-label="Bulk quantity" style={{ ...S.fInput, width: 70, height: 28, fontSize: 12, textAlign: 'right', fontFamily: T.mono, padding: '4px 8px' }} />}
        <button type="button" onClick={apply} style={{ ...(action === 'remove' ? S.btnDanger : S.btnPrimary), ...S.btnSm, minHeight: 28, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy ? 'Applying…' : 'Apply'}</button>
        <button type="button" onClick={() => setShowPaste(s => !s)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 28 }}>{showPaste ? 'Close list' : 'Paste list'}</button>
      </div>
      {showPaste && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={5} placeholder={'Paste two columns from Excel — SKU and quantity:\n14001-L\t3\n14001-M\t3\n14002-S\t0   (0 removes it)'} style={{ ...S.fInput, height: 'auto', minHeight: 100, fontFamily: T.mono, fontSize: 12, resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: T.tx3 }}>{paste.trim() ? `${parsePaste(paste).list.length} SKUs read` : 'Sets each SKU to the quantity given; new SKUs are added.'}</span>
            <button type="button" onClick={applyPaste} style={{ ...S.btnPrimary, ...S.btnSm, minHeight: 28, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy ? 'Applying…' : 'Apply list'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

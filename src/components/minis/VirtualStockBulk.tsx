// Bulk change for Virtual Stock Override (owner, 2026-11-04): pick SKUs (the
// ticked ones, or everything the search shows) and set / add / subtract a
// quantity or remove them in one go — or paste "SKU qty" lines from Excel, or
// import a CSV / Excel file of SKU + quantity (owner, 2026-11-19), the same
// columns Export writes. Paste and file are offered on an empty list too.
// Writes are single statements per batch: update … in (ids), upsert on the
// unique sku, delete … in (ids). A quantity that reaches 0 removes the SKU.
import { useRef, useState } from 'react';
import { supabase, currentUserId } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import { readStockFile, type StockLine } from './virtualStockFile';

type Row = { id: string; sku: string; quantity: number };
type Action = 'set' | 'add' | 'sub' | 'remove';
const BATCH = 200;
const chunks = <X,>(a: X[]) => Array.from({ length: Math.ceil(a.length / BATCH) }, (_, i) => a.slice(i * BATCH, (i + 1) * BATCH));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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

  // A refresh half-way would leave some batches written and others not: the browser asks first while one runs.
  const run = async (label: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    const hold = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', hold);
    try { await work(); addToast(label, 'success'); onClear(); onDone(); }
    catch (e) { addToast('Bulk change failed — ' + friendlyError(e), 'error'); onDone(); }
    finally { window.removeEventListener('beforeunload', hold); setBusy(false); }
  };
  const del = async (ids: string[]) => { for (const c of chunks(ids)) { const { error } = await supabase.from('virtual_stock').delete().in('id', c); if (error) throw error; } };
  // SKUs already there (`have`): upsert on the unique sku (only quantity/updated_at change);
  // new SKUs: insert with who added them.
  const upsert = async (list: { sku: string; quantity: number }[], have: Set<string>) => {
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
      await upsert(next.filter(x => x.n > 0).map(x => ({ sku: x.r.sku, quantity: x.n })), new Set(target.map(r => r.sku)));
      if (zero.length) await del(zero.map(x => x.r.id));
    });
  };

  /** Pasted lines or a file: each SKU set to its quantity, new ones added, 0 removes. What is there now is asked of
   *  the database, not taken from the list on screen (it shows the first 1000 only). */
  const applyList = async (list: StockLine[], notes: string[], after?: () => void) => {
    const now = new Map<string, Row>();
    try {
      for (const c of chunks(list.map(x => x.sku))) {
        const { data, error } = await supabase.from('virtual_stock').select('id, sku, quantity').in('sku', c);
        if (error) throw error;
        for (const r of data || []) now.set(r.sku, r);
      }
    } catch (e) { addToast(friendlyError(e), 'error'); return; }
    const gone = list.filter(x => x.qty === 0 && now.has(x.sku)).map(x => now.get(x.sku)!.id);
    const keep = list.filter(x => x.qty > 0 && now.get(x.sku)?.quantity !== x.qty);
    const same = list.filter(x => x.qty > 0 && now.get(x.sku)?.quantity === x.qty).length;
    const isNew = keep.filter(x => !now.has(x.sku)).length;
    const absent = list.filter(x => x.qty === 0 && !now.has(x.sku)).length;
    const counts = `${keep.length - isNew} updated, ${isNew} new, ${gone.length} removed (qty 0)${same ? `, ${same} already at that quantity` : ''}${absent ? `, ${absent} with qty 0 not in the list` : ''}.`;
    if (!keep.length && !gone.length) { addToast(`Nothing to change — ${counts}`, 'info'); after?.(); return; }
    if (!await ask({ title: `Apply ${plural(list.length, 'SKU')}?`, message: [counts, ...notes].join(' '), confirmLabel: 'Apply' })) return;
    return run(`Virtual stock: ${keep.length} set, ${gone.length} removed`, async () => {
      await upsert(keep.map(x => ({ sku: x.sku, quantity: x.qty })), new Set(now.keys()));
      if (gone.length) await del(gone);
      after?.();
    });
  };

  const applyPaste = async () => {
    const { list, bad } = parsePaste(paste);
    if (!list.length) { addToast(bad.length ? `Could not read: ${bad.slice(0, 3).join(' | ')}` : 'Paste lines like "14001-L 5"', 'error'); return; }
    await applyList(list, bad.length ? [`${plural(bad.length, 'unreadable line')} skipped.`] : [], () => { setPaste(''); setShowPaste(false); });
  };

  const importFile = async (file: File) => {
    setReading(true);
    let f: Awaited<ReturnType<typeof readStockFile>>;
    try { f = await readStockFile(file); } catch (e) { addToast(friendlyError(e), 'error'); return; } finally { setReading(false); }
    if (!f.list.length) { addToast(`No quantities read from ${file.name}${f.bad.length ? ` — e.g. ${f.bad.slice(0, 2).join(' | ')}` : ''}`, 'error'); return; }
    await applyList(f.list, [
      ...(f.bad.length ? [`${plural(f.bad.length, 'line')} without a whole quantity skipped (${f.bad.slice(0, 3).join(', ')}${f.bad.length > 3 ? '…' : ''}).`] : []),
      ...(f.repeated ? [`${plural(f.repeated, 'SKU')} listed twice — the last line counts.`] : []),
      ...(f.noHeader ? ['No SKU / Quantity header found — columns A and B were used.'] : []),
    ]);
  };

  const off = busy || reading;
  const sel = { padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, background: 'rgba(255,255,255,.04)', border: `1px solid ${T.bd}`, color: T.tx, outline: 'none' } as const;
  const listButtons = <span style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.txt,text/csv" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
    <button type="button" className="touch44" onClick={() => fileRef.current?.click()} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 28, pointerEvents: off ? 'none' : 'auto', opacity: off ? 0.5 : 1 }}>{reading ? 'Reading…' : 'Import file'}</button>
    <button type="button" className="touch44" onClick={() => setShowPaste(s => !s)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 28 }}>{showPaste ? 'Close list' : 'Paste list'}</button>
  </span>;
  return (
    <div style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8, padding: '8px 10px', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: T.tx2, flex: '1 1 260px' }}>Add many at once: a CSV or Excel file with SKU and Quantity columns (like Export makes), or two columns pasted from Excel.</span>
          {listButtons}
        </div>
      ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minHeight: 28 }}>
          <input type="checkbox" checked={allTicked} ref={el => { if (el) el.indeterminate = someTicked; }} onChange={toggleAll} aria-label="Select all shown SKUs" style={{ width: 16, height: 16, accentColor: T.ac, cursor: 'pointer' }} />
          <span style={{ fontSize: 11, color: T.tx2 }}>Select all ({shown.length})</span>
        </label>
        <span style={{ ...S.fLabel, marginBottom: 0 }}>Bulk change</span>
        <span style={{ fontSize: 11, color: selected.size ? T.ac2 : T.tx3 }}>{scope}</span>
        {selected.size > 0 && <button type="button" className="touch44" onClick={onClear} style={{ ...S.btnSm, border: `1px solid ${T.bd2}`, background: 'transparent', color: T.tx3, cursor: 'pointer' }}>Clear ticks</button>}
        <span style={{ flex: 1 }} />
        <select value={action} onChange={e => setAction(e.target.value as Action)} style={sel} aria-label="Bulk action">
          <option value="set">Set to</option><option value="add">Add</option><option value="sub">Subtract</option><option value="remove">Remove</option>
        </select>
        {action !== 'remove' && <input type="number" min="0" step="1" value={qty} onChange={e => setQty(e.target.value)} onKeyDown={e => { numericKeyDown(e); if (e.key === 'Enter') apply(); }} placeholder="Qty" aria-label="Bulk quantity" style={{ ...S.fInput, width: 70, height: 28, fontSize: 12, textAlign: 'right', fontFamily: T.mono, padding: '4px 8px' }} />}
        <button type="button" className="touch44" onClick={apply} style={{ ...(action === 'remove' ? S.btnDanger : S.btnPrimary), ...S.btnSm, minHeight: 28, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy ? 'Applying…' : 'Apply'}</button>
        {listButtons}
      </div>
      )}
      {showPaste && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={5} placeholder={'Paste two columns from Excel — SKU and quantity:\n14001-L\t3\n14001-M\t3\n14002-S\t0   (0 removes it)'} style={{ ...S.fInput, height: 'auto', minHeight: 100, fontFamily: T.mono, fontSize: 12, resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: T.tx3 }}>{paste.trim() ? `${parsePaste(paste).list.length} SKUs read` : 'Sets each SKU to the quantity given; new SKUs are added.'}</span>
            <button type="button" className="touch44" onClick={applyPaste} style={{ ...S.btnPrimary, ...S.btnSm, minHeight: 28, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy ? 'Applying…' : 'Apply list'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

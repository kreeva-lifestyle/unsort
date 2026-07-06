// Import the owner's Time Sheet Excel. Header-name mapping (order-tolerant),
// auto-creates unseen employees (salary 0 → flagged in the Employees tab),
// upserts entries on (employee_id, date). Never silently drops a row —
// unparseable rows are counted and reasoned.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { AttEmployee, excelCellToDateISO, excelCellToTime } from '../../lib/attendance';

type Result = { inserted: number; employeesCreated: number; skipped: { row: number; reason: string }[] } | null;

// Match a header cell to a canonical field (case/space/punct tolerant).
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const HEADER_ALIASES: Record<string, string[]> = {
  code: ['employeeid', 'empid', 'id', 'code'],
  name: ['employeename', 'name', 'employee'],
  date: ['date'],
  day: ['day'],
  shift: ['shiftid', 'shift'],
  in: ['intime', 'in'],
  out: ['outtime', 'out'],
  locIn: ['locationin'],
  locOut: ['locationout'],
  status: ['status'],
  remarks: ['remarks'],
  mgr: ['managersremarks', 'managerremarks', 'mgrremarks'],
};

export default function ImportExcel({ employees, onClose, onImported, addToast }: {
  employees: AttEmployee[]; onClose: () => void; onImported: () => void; addToast: (m: string, t?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [fileName, setFileName] = useState('');

  useEffect(() => { document.body.classList.toggle('modal-open', true); return () => document.body.classList.remove('modal-open'); }, []);

  const handleFile = async (file: File) => {
    setBusy(true); setResult(null); setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      if (rows.length < 2) { addToast('Sheet has no data rows', 'error'); setBusy(false); return; }

      // Resolve columns from the header row.
      const header = (rows[0] as unknown[]).map(h => norm(String(h ?? '')));
      const col: Record<string, number> = {};
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        col[field] = header.findIndex(h => aliases.includes(h));
      }
      if (col.name < 0 || col.date < 0) { addToast('Could not find "Employee Name" and "Date" columns in the sheet header', 'error'); setBusy(false); return; }

      const get = (r: unknown[], f: string) => (col[f] >= 0 ? r[col[f]] : null);
      const skipped: { row: number; reason: string }[] = [];

      // Build the set of names → resolve/create employees first.
      const nameByLower = new Map(employees.map(e => [e.name.trim().toLowerCase(), e]));
      let employeesCreated = 0;
      const toCreate = new Map<string, { name: string; code: string | null }>();
      for (let i = 1; i < rows.length; i++) {
        const nm = String(get(rows[i], 'name') ?? '').trim();
        if (!nm) continue;
        const key = nm.toLowerCase();
        if (!nameByLower.has(key) && !toCreate.has(key)) {
          toCreate.set(key, { name: nm, code: (String(get(rows[i], 'code') ?? '').trim() || null) });
        }
      }
      if (toCreate.size > 0) {
        const { data: created, error: cErr } = await supabase.from('attendance_employees')
          .insert([...toCreate.values()].map(v => ({ name: v.name, employee_code: v.code, salary: 0, fix_time_minutes: 510 })))
          .select('id, employee_code, name, salary, fix_time_minutes, is_active');
        if (cErr) { addToast('Could not create new employees — ' + friendlyError(cErr), 'error'); setBusy(false); return; }
        (created as AttEmployee[] || []).forEach(e => nameByLower.set(e.name.trim().toLowerCase(), e));
        employeesCreated = created?.length || 0;
      }

      // Build entry rows.
      type EntryRow = { employee_id: string; date: string; day: string | null; shift_id: string | null; in_time: string | null; out_time: string | null; location_in: string | null; location_out: string | null; status: string | null; remarks: string | null; manager_remarks: string | null };
      const seen = new Set<string>();
      const toUpsert: EntryRow[] = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const nm = String(get(r, 'name') ?? '').trim();
        if (!nm && !(r || []).some(c => c != null && c !== '')) continue; // wholly blank row
        const emp = nameByLower.get(nm.toLowerCase());
        if (!emp) { skipped.push({ row: i + 1, reason: 'no employee name' }); continue; }
        const dateISO = excelCellToDateISO(get(r, 'date'));
        if (!dateISO) { skipped.push({ row: i + 1, reason: `unreadable date "${String(get(r, 'date') ?? '')}"` }); continue; }
        const key = `${emp.id}|${dateISO}`;
        if (seen.has(key)) { skipped.push({ row: i + 1, reason: 'duplicate employee+date in file' }); continue; }
        seen.add(key);
        const str = (f: string) => { const v = get(r, f); const s = v == null ? '' : String(v).trim(); return s || null; };
        toUpsert.push({
          employee_id: emp.id, date: dateISO, day: str('day'), shift_id: str('shift'),
          in_time: excelCellToTime(get(r, 'in')), out_time: excelCellToTime(get(r, 'out')),
          location_in: str('locIn'), location_out: str('locOut'), status: str('status'),
          remarks: str('remarks'), manager_remarks: str('mgr'),
        });
      }

      // Upsert in batches of 500 on the (employee_id, date) unique key.
      let inserted = 0;
      for (let i = 0; i < toUpsert.length; i += 500) {
        const batch = toUpsert.slice(i, i + 500);
        const { error } = await supabase.from('attendance_entries').upsert(batch, { onConflict: 'employee_id,date' });
        if (error) { addToast(`Row batch failed — ${friendlyError(error)}`, 'error'); setBusy(false); return; }
        inserted += batch.length;
      }
      setResult({ inserted, employeesCreated, skipped });
      addToast(`Imported ${inserted} entr${inserted === 1 ? 'y' : 'ies'}${employeesCreated ? `, ${employeesCreated} new employee(s)` : ''}${skipped.length ? `, ${skipped.length} skipped` : ''}`, skipped.length ? 'error' : 'success');
    } catch (e) {
      addToast('Could not read the file — ' + friendlyError(e), 'error');
    } finally { setBusy(false); }
  };

  return createPortal((
    <div style={{ ...S.modalOverlay }} onClick={() => !busy && onClose()}>
      <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 460 }} onClick={ev => ev.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>Import Timesheet (Excel)</div>
          <span onClick={() => !busy && onClose()} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.5, marginBottom: 12 }}>
            Upload the .xlsx with columns like <b>Employee ID, Employee Name, Date, Day, In Time, Out Time, Status, Remarks, Manager's Remarks</b>. Column order doesn't matter. New names become employees (set their salary in the Employees tab). Re-importing the same month updates existing rows.
          </div>
          {!result && (
            <label style={{ display: 'block', border: `1px dashed ${T.bd2}`, borderRadius: 10, padding: 24, textAlign: 'center', cursor: busy ? 'default' : 'pointer', background: 'rgba(255,255,255,0.02)' }}>
              <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <div style={{ fontSize: 13, color: busy ? T.tx3 : T.ac2, fontWeight: 600 }}>{busy ? `Reading ${fileName}…` : 'Choose Excel file'}</div>
              <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>.xlsx · .xls · .csv</div>
            </label>
          )}
          {result && (
            <div>
              <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.gr }}>{result.inserted} entries imported</div>
                {result.employeesCreated > 0 && <div style={{ fontSize: 11, color: T.tx2, marginTop: 4 }}>{result.employeesCreated} new employee(s) created — set their salary + fix time in the Employees tab.</div>}
              </div>
              {result.skipped.length > 0 && (
                <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 8, padding: 10, marginBottom: 10, maxHeight: 160, overflowY: 'auto' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.yl, marginBottom: 4 }}>{result.skipped.length} row(s) skipped</div>
                  {result.skipped.slice(0, 30).map((s, i) => <div key={i} style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>Row {s.row}: {s.reason}</div>)}
                  {result.skipped.length > 30 && <div style={{ fontSize: 10, color: T.tx3 }}>…and {result.skipped.length - 30} more</div>}
                </div>
              )}
              <button onClick={onImported} style={{ ...S.btnPrimary, width: '100%' }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}

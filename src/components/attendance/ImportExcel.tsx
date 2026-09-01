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
import { useBackClose } from '../../hooks/useBackClose';

// month: the dominant YYYY-MM of the imported rows — the page jumps there
// after Done. Importing July while the picker sits on August (the default is
// the current month) used to look like "imported successfully but the
// timesheet is empty".
type Result = { inserted: number; employeesCreated: number; skipped: { row: number; reason: string }[]; month: string | null; warnings: string[] } | null;

// Minimal RFC-4180 CSV → string cells (quotes, embedded commas/newlines).
// Cells stay strings so dd/mm dates are not date-guessed (see handleFile).
const parseCSV = (text: string): string[][] => {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c === '\r') { if (t[i + 1] !== '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } } // lone-CR = newline; CRLF handled by the \n branch
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
};

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
  employees: AttEmployee[]; onClose: () => void; onImported: (entriesMonth?: string | null) => void; addToast: (m: string, t?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [fileName, setFileName] = useState('');
  // Inline error mirror of the failure toasts (modal contract): the message
  // must live INSIDE the modal too, never only in a transient toast.
  const [err, setErr] = useState('');
  const fail = (msg: string) => { setErr(msg); addToast(msg, 'error'); setBusy(false); };

  useEffect(() => { document.body.classList.toggle('modal-open', true); return () => document.body.classList.remove('modal-open'); }, []);
  // Back dismisses this overlay instead of leaving the page (or closing the
  // PWA). Deliberately NOT gated on `busy`: gating would tear the history
  // entry down the moment an import starts and navigate the app away. The
  // upsert is already batched + idempotent, so closing early is safe.
  useBackClose(true, () => { onClose(); });

  const handleFile = async (file: File) => {
    setBusy(true); setResult(null); setErr(''); setFileName(file.name);
    try {
      // CSV is parsed as raw text — SheetJS's CSV reader coerces "01/06/2026"
      // (dd/mm) into a US mm/dd date serial at read time, silently swapping
      // day↔month for days 1–12. Keeping cells as strings lets
      // excelCellToDateISO apply the correct dd/mm rule. XLSX/XLS keep true
      // locale-independent serials, so those go through SheetJS.
      let rows: unknown[][];
      if (/\.csv$/i.test(file.name)) {
        rows = parseCSV(await file.text());
      } else {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
      }
      if (rows.length < 2) { fail('Sheet has no data rows'); return; }

      // Resolve columns from the header row.
      const header = (rows[0] as unknown[]).map(h => norm(String(h ?? '')));
      const col: Record<string, number> = {};
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        // Alias PRIORITY, not leftmost column: a serial "ID" column before
        // "Employee ID" used to hijack the code field.
        col[field] = aliases.map(a => header.indexOf(a)).find(i => i >= 0) ?? -1;
      }
      if (col.name < 0 || col.date < 0) { fail('Could not find "Employee Name" and "Date" columns in the sheet header'); return; }

      const get = (r: unknown[], f: string) => (col[f] >= 0 ? r[col[f]] : null);
      const skipped: { row: number; reason: string }[] = [];

      // FRESH employee list, not the prop: after a failed import the prop is
      // stale (employees created moments ago are missing from it), so a retry
      // re-created them and hit the unique-name index on every attempt.
      const { data: freshEmp } = await supabase.from('attendance_employees')
        .select('id, employee_code, name, salary, fix_time_minutes, is_active, qr_image_url').order('name');
      const empList = (freshEmp as AttEmployee[] | null) || employees;

      // Employee resolution keys on the Employee ID (stable across renames)
      // first, then falls back to name.
      const byCode = new Map(empList.filter(e => e.employee_code).map(e => [e.employee_code!.trim().toLowerCase(), e]));
      const nameByLower = new Map<string, AttEmployee>();
      const ambiguousNames = new Set<string>();
      for (const e of empList) {
        const k = e.name.trim().toLowerCase();
        if (nameByLower.has(k)) ambiguousNames.add(k); else nameByLower.set(k, e);
      }
      const resolve = (code: string, nm: string): AttEmployee | null => {
        const c = code.trim().toLowerCase();
        if (c && byCode.has(c)) return byCode.get(c)!;
        const n = nm.trim().toLowerCase();
        if (n && !ambiguousNames.has(n) && nameByLower.has(n)) return nameByLower.get(n)!;
        return null;
      };

      // Create employees for rows that resolve to no existing record — keyed
      // by code (or name when code-less) so one person is never created twice.
      let employeesCreated = 0;
      const toCreate = new Map<string, { name: string; code: string | null }>();
      for (let i = 1; i < rows.length; i++) {
        const nm = String(get(rows[i], 'name') ?? '').trim();
        const code = String(get(rows[i], 'code') ?? '').trim();
        if (!nm) continue;
        if (resolve(code, nm)) continue;
        const key = nm.trim().toLowerCase(); // the unique index is on lower(trim(name))
        if (!toCreate.has(key)) toCreate.set(key, { name: nm, code: code || null });
      }
      if (toCreate.size > 0) {
        const { data: created, error: cErr } = await supabase.from('attendance_employees')
          .insert([...toCreate.values()].map(v => ({ name: v.name, employee_code: v.code, salary: 0, fix_time_minutes: 510 })))
          .select('id, employee_code, name, salary, fix_time_minutes, is_active');
        if (cErr) { fail('Could not create new employees — ' + friendlyError(cErr)); return; }
        (created as AttEmployee[] || []).forEach(e => {
          if (e.employee_code) byCode.set(e.employee_code.trim().toLowerCase(), e);
          const k = e.name.trim().toLowerCase();
          if (!nameByLower.has(k)) nameByLower.set(k, e); // fresh creates are unique by construction
        });
        employeesCreated = created?.length || 0;
      }

      // Only write columns actually present in the sheet, so re-importing a
      // sheet that omits a column can't null out existing values on conflict.
      const optionalFields: [keyof EntryRow, string, 'str' | 'time'][] = [
        ['day', 'day', 'str'], ['shift_id', 'shift', 'str'], ['in_time', 'in', 'time'], ['out_time', 'out', 'time'],
        ['location_in', 'locIn', 'str'], ['location_out', 'locOut', 'str'], ['status', 'status', 'str'],
        ['remarks', 'remarks', 'str'], ['manager_remarks', 'mgr', 'str'],
      ];
      type EntryRow = { employee_id: string; date: string; day?: string | null; shift_id?: string | null; in_time?: string | null; out_time?: string | null; location_in?: string | null; location_out?: string | null; status?: string | null; remarks?: string | null; manager_remarks?: string | null };
      const seen = new Set<string>();
      const toUpsert: EntryRow[] = [];
      let badTimes = 0, overnight = 0; // unreadable time cells / out <= in punches
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const nm = String(get(r, 'name') ?? '').trim();
        const code = String(get(r, 'code') ?? '').trim();
        if (!nm && !(r || []).some(c => c != null && c !== '')) continue; // wholly blank row
        const emp = resolve(code, nm);
        if (!emp) { skipped.push({ row: i + 1, reason: nm && ambiguousNames.has(nm.toLowerCase()) ? `name "${nm}" is shared by multiple employees — add the Employee ID column` : 'no matching employee (name/ID)' }); continue; }
        const dateISO = excelCellToDateISO(get(r, 'date'));
        if (!dateISO) { skipped.push({ row: i + 1, reason: `unreadable date "${String(get(r, 'date') ?? '')}"` }); continue; }
        const key = `${emp.id}|${dateISO}`;
        if (seen.has(key)) { skipped.push({ row: i + 1, reason: 'duplicate employee+date in file' }); continue; }
        seen.add(key);
        const str = (f: string) => { const v = get(r, f); const s = v == null ? '' : String(v).trim(); return s || null; };
        const row: EntryRow = { employee_id: emp.id, date: dateISO };
        for (const [field, srcKey, kind] of optionalFields) {
          if (col[srcKey] < 0) continue; // column absent → don't clobber on conflict
          if (kind === 'time') {
            const raw = get(r, srcKey);
            const t = excelCellToTime(raw);
            // Non-empty cell that didn't parse = a punch about to silently
            // become an unpaid absence — count it and tell the owner.
            if (t === null && raw != null && String(raw).trim() !== '') badTimes++;
            (row as Record<string, string | null>)[field] = t;
          } else {
            (row as Record<string, string | null>)[field] = str(srcKey);
          }
        }
        if (row.in_time && row.out_time && row.out_time <= row.in_time) overnight++;
        toUpsert.push(row);
      }

      // Dominant month of the imported rows (mode) — where the data now lives.
      const monthCounts = new Map<string, number>();
      for (const r of toUpsert) { const k = r.date.slice(0, 7); monthCounts.set(k, (monthCounts.get(k) || 0) + 1); }
      const domMonth = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const warns: string[] = [];
      if (monthCounts.size > 1) warns.push(`Sheet spans ${monthCounts.size} months (${[...monthCounts.entries()].map(([k, n]) => `${k}: ${n} rows`).join(', ')}) — the timesheet will show ${domMonth}; check the other month(s) with the month picker.`);
      if (badTimes > 0) warns.push(`${badTimes} time value(s) could not be read and were left blank — those punches count as unpaid until fixed. Times should look like 9:52, 09:52:00 or 9:52 AM.`);
      if (overnight > 0) warns.push(`${overnight} row(s) have Out ≤ In (overnight or swapped punches) — those days earn nothing. Overnight shifts are not supported; fix the times in the timesheet.`);

      // Upsert in batches of 500 on the (employee_id, date) unique key. On a
      // mid-way failure the earlier batches ARE committed — say so, and note
      // that re-importing the same file is safe (rows update, never duplicate).
      let inserted = 0;
      for (let i = 0; i < toUpsert.length; i += 500) {
        const batch = toUpsert.slice(i, i + 500);
        const { error } = await supabase.from('attendance_entries').upsert(batch, { onConflict: 'employee_id,date' });
        if (error) {
          setResult({ inserted, employeesCreated, skipped, month: inserted > 0 ? domMonth : null, warnings: warns });
          fail(`Import stopped after ${inserted} of ${toUpsert.length} rows — ${friendlyError(error)}. The saved rows are kept; re-importing the same file is safe (it updates, never duplicates).`);
          return;
        }
        inserted += batch.length;
      }
      setResult({ inserted, employeesCreated, skipped, month: domMonth, warnings: warns });
      addToast(`Imported ${inserted} entr${inserted === 1 ? 'y' : 'ies'}${employeesCreated ? `, ${employeesCreated} new employee(s)` : ''}${skipped.length ? `, ${skipped.length} skipped` : ''}`, (skipped.length || warns.length) ? 'error' : 'success');
    } catch (e) {
      setErr('Could not read the file — ' + friendlyError(e));
      addToast('Could not read the file — ' + friendlyError(e), 'error');
    } finally { setBusy(false); }
  };

  return createPortal((
    <div style={{ ...S.modalOverlay }} onClick={() => !busy && onClose()}>
      <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 460 }} onClick={ev => ev.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>Import Timesheet (Excel)</div>
          <button type="button" onClick={() => !busy && onClose()} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.5, marginBottom: 12 }}>
            Upload the .xlsx with columns like <b>Employee ID, Employee Name, Date, Day, In Time, Out Time, Status, Remarks, Manager's Remarks</b>. Column order doesn't matter. New names become employees (set their salary in the Employees tab). Re-importing the same month updates existing rows — including overwriting hand-edits in any column the sheet contains.
          </div>
          {err && <div style={{ background: 'oklch(0.63 0.22 25 / .08)', border: '1px solid oklch(0.63 0.22 25 / .2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10 }}>{err}</div>}
          {!result && (
            <label style={{ display: 'block', border: `1px dashed ${T.bd2}`, borderRadius: 10, padding: 24, textAlign: 'center', cursor: busy ? 'default' : 'pointer', background: 'rgba(255,255,255,0.02)' }}>
              <input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" disabled={busy} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <div style={{ fontSize: 13, color: busy ? T.tx3 : T.ac2, fontWeight: 600 }}>{busy ? `Reading ${fileName}…` : 'Choose Excel file'}</div>
              <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>.xlsx · .xls · .csv</div>
            </label>
          )}
          {result && (
            <div>
              <div style={{ background: 'oklch(0.72 0.19 145 / .06)', border: '1px solid oklch(0.72 0.19 145 / .2)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.gr }}>{result.inserted} entries imported</div>
                {result.month && <div style={{ fontSize: 11, color: T.tx2, marginTop: 4 }}>The sheet's dates are in <b>{new Date(result.month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b> — the timesheet will switch to that month.</div>}
                {result.employeesCreated > 0 && <div style={{ fontSize: 11, color: T.tx2, marginTop: 4 }}>{result.employeesCreated} new employee(s) created — set their salary + fix time in the Employees tab.</div>}
              </div>
              {result.warnings.length > 0 && (
                <div style={{ background: 'oklch(0.78 0.18 75 / .06)', border: '1px solid oklch(0.78 0.18 75 / .2)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  {result.warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: T.yl, marginBottom: 3 }}>{w}</div>)}
                </div>
              )}
              {result.skipped.length > 0 && (
                <div style={{ background: 'oklch(0.78 0.18 75 / .06)', border: '1px solid oklch(0.78 0.18 75 / .2)', borderRadius: 8, padding: 10, marginBottom: 10, maxHeight: 160, overflowY: 'auto' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.yl, marginBottom: 4 }}>{result.skipped.length} row(s) skipped</div>
                  {result.skipped.slice(0, 30).map((s, i) => <div key={i} style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>Row {s.row}: {s.reason}</div>)}
                  {result.skipped.length > 30 && <div style={{ fontSize: 10, color: T.tx3 }}>…and {result.skipped.length - 30} more</div>}
                </div>
              )}
              <button onClick={() => onImported(result.month)} style={{ ...S.btnPrimary, width: '100%' }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}

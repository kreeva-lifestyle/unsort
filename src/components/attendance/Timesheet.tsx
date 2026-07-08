// Monthly timesheet — mirrors the owner's "Time Sheet" columns, with a
// computed Duration (out−in) and per-row diff-vs-fix highlighting, plus
// employee / status / text filters.
import { useState, useMemo } from 'react';
import { T, S } from '../../lib/theme';
import { AttEmployee, AttEntry, timeToMinutes, minutesToHM, fmtDiffHM } from '../../lib/attendance';

export default function AttendanceTimesheet({ employees, entries, month }: {
  employees: AttEmployee[]; entries: AttEntry[]; month: string;
}) {
  const [empFilter, setEmpFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');

  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const fixById = useMemo(() => new Map(employees.map(e => [e.id, e.fix_time_minutes])), [employees]);

  const statuses = useMemo(() => [...new Set(entries.map(e => e.status).filter(Boolean) as string[])].sort(), [entries]);

  const rows = useMemo(() => {
    const sq = q.toLowerCase().trim();
    return entries
      .filter(e => (!empFilter || e.employee_id === empFilter))
      .filter(e => (!statusFilter || e.status === statusFilter))
      .filter(e => {
        if (!sq) return true;
        const emp = empById.get(e.employee_id);
        return (emp?.name || '').toLowerCase().includes(sq) || (emp?.employee_code || '').toLowerCase().includes(sq) || (e.remarks || '').toLowerCase().includes(sq) || (e.manager_remarks || '').toLowerCase().includes(sq);
      })
      .sort((a, b) => (empById.get(a.employee_id)?.name || '').localeCompare(empById.get(b.employee_id)?.name || '') || a.date.localeCompare(b.date));
  }, [entries, empFilter, statusFilter, q, empById]);

  const dur = (e: AttEntry): { txt: string; short: boolean; diffMin: number } | null => {
    const i = timeToMinutes(e.in_time), o = timeToMinutes(e.out_time);
    if (i === null || o === null || o <= i) return null;
    const worked = o - i;
    const fix = fixById.get(e.employee_id) ?? 510;
    return { txt: minutesToHM(worked), short: worked < fix, diffMin: worked - fix };
  };
  const diffColor = (m: number) => (m > 0 ? T.gr : m < 0 ? T.re : T.tx3);

  const monthLabel = new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="att-filters" style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name / remarks…" style={{ ...S.fSearch, width: '100%' }} />
        </div>
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} style={{ ...S.fInput, maxWidth: 200 }}>
          <option value="">All employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...S.fInput, maxWidth: 130 }}>
          <option value="">All status</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ fontSize: 10, color: T.tx3, marginBottom: 8 }}>{monthLabel} · {rows.length} row{rows.length !== 1 ? 's' : ''}</div>

      {/* Desktop table */}
      <div className="desktop-only" style={{ border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 840 }}>
          <thead>
            <tr>
              {['Employee', 'Date', 'Day', 'In', 'Out', 'Duration', '+/− vs Fix', 'Status', 'Remarks', "Mgr's Remarks"].map(h => (
                <th key={h} style={{ ...S.thStyle, padding: '9px 12px', textAlign: 'left', position: 'sticky', top: 0, background: T.s2, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(e => {
              const d = dur(e);
              const emp = empById.get(e.employee_id);
              return (
                <tr key={e.id} style={{ borderTop: `1px solid ${T.bd}` }}>
                  <td style={{ ...S.tdStyle, whiteSpace: 'nowrap' }}>{emp?.name || '—'}{emp?.employee_code ? <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, marginLeft: 6 }}>{emp.employee_code}</span> : null}</td>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, whiteSpace: 'nowrap' }}>{new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                  <td style={S.tdStyle}>{e.day || new Date(e.date).toLocaleDateString('en-IN', { weekday: 'short' })}</td>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono }}>{e.in_time || '—'}</td>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono }}>{e.out_time || '—'}</td>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, color: d ? (d.short ? T.re : T.gr) : T.tx3, fontWeight: 600 }}>{d ? d.txt : '—'}</td>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, color: d ? diffColor(d.diffMin) : T.tx3, fontWeight: 600 }}>{d ? fmtDiffHM(d.diffMin) : '—'}</td>
                  <td style={S.tdStyle}><span style={{ fontSize: 10, fontWeight: 600, color: e.status === 'A' ? T.re : e.status === 'WO' ? T.tx3 : T.tx2 }}>{e.status || '—'}</span></td>
                  <td style={{ ...S.tdStyle, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.remarks || ''}>{e.remarks || ''}</td>
                  <td style={{ ...S.tdStyle, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.manager_remarks || ''}>{e.manager_remarks || ''}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={10} style={{ ...S.tdStyle, textAlign: 'center', color: T.tx3, padding: 30 }}>No entries for {monthLabel}. Use Import Excel to add the timesheet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="att-mobile mobile-only" style={{ display: 'none', flexDirection: 'column', gap: 6 }}>
        {rows.map(e => {
          const d = dur(e);
          const emp = empById.get(e.employee_id);
          const stColor = e.status === 'A' ? T.re : e.status === 'WO' ? T.tx3 : T.gr;
          return (
            <div key={e.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '11px 13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp?.name || '—'}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.tx3 }}>{new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · {e.day}</span>
                  {e.status && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: `${stColor}22`, color: stColor }}>{e.status}</span>}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 11, fontFamily: T.mono, color: T.tx2, alignItems: 'center' }}>
                <span style={{ background: 'rgba(255,255,255,0.03)', padding: '2px 8px', borderRadius: 5 }}>In {e.in_time || '—'}</span>
                <span style={{ background: 'rgba(255,255,255,0.03)', padding: '2px 8px', borderRadius: 5 }}>Out {e.out_time || '—'}</span>
                <span style={{ marginLeft: 'auto', color: d ? (d.short ? T.re : T.gr) : T.tx3, fontWeight: 700 }}>{d ? d.txt : '—'}</span>
                {d && d.diffMin !== 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: `${diffColor(d.diffMin)}22`, color: diffColor(d.diffMin) }}>{fmtDiffHM(d.diffMin)}</span>}
              </div>
              {(e.remarks || e.manager_remarks) && (
                <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[e.remarks, e.manager_remarks].filter(Boolean).join(' · ')}</div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No entries for {monthLabel}.</div>}
      </div>
    </div>
  );
}

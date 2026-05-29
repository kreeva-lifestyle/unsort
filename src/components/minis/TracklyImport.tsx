import { useState, useRef } from 'react';
import { T } from '../../lib/theme';
import { SUPABASE_ANON_KEY } from '../../lib/supabase';

const EDGE = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/short-track';

function csvSafe(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function autoDownload(results: { input: string; status: string }[]) {
  const rows = ['SKU,STOCK STATUS', ...results.map(r => `"${csvSafe(r.input).replace(/"/g, '""')}","${r.status}"`)];
  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `stock-status-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export default function TracklyImport({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const process = async (skus: string[]) => {
    const clean = skus.map(s => s.trim()).filter(Boolean);
    if (!clean.length) { setError('No SKUs found in the file'); return; }
    if (clean.length > 500) { setError('Maximum 500 SKUs per file'); return; }
    setLoading(true); setError(''); setMsg(`Looking up ${clean.length} SKUs…`);
    try {
      const res = await fetch(EDGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'lookup', skus: clean }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.results)) {
        autoDownload(data.results);
        const active = data.results.filter((r: any) => r.status === 'Active').length;
        const inactive = data.results.filter((r: any) => r.status === 'Inactive').length;
        const notFound = data.results.filter((r: any) => r.status === 'Not Found').length;
        setMsg(`Done — ${active} Active, ${inactive} Inactive, ${notFound} Not Found`);
      } else {
        setError(data.error || 'Lookup failed');
      }
    } catch { setError('Network error — please try again'); }
    setLoading(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setMsg('');
    try {
      if (file.name.match(/\.csv$|\.txt$/i)) {
        const t = await file.text();
        const lines = t.split(/\r?\n/).filter(s => s.trim());
        const skus = lines.slice(1).map(l => l.split(',')[0].replace(/^"|"$/g, '').trim()).filter(Boolean);
        await process(skus);
      } else {
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const skus = rows.slice(1).map(r => String(r[0] ?? '').trim()).filter(Boolean);
        await process(skus);
      }
    } catch { setError('Could not read the file — ensure it is .xlsx or .csv'); }
    e.target.value = '';
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: T.bg, fontFamily: T.sans, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: T.tx2, cursor: 'pointer', padding: 6, fontSize: 18, lineHeight: 1 }}>&larr;</button>
        <div style={{ fontFamily: 'Sora, Inter, sans-serif', fontSize: 15, fontWeight: 700, color: T.tx }}>Self Import</div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: T.tx2, marginBottom: 20, lineHeight: 1.6 }}>
            Upload your file with SKUs in <strong style={{ color: T.tx }}>Column A</strong> (starting from row 2).
            <br />Results will auto-download as CSV.
          </div>

          <button onClick={() => !loading && fileRef.current?.click()} style={{
            width: '100%', padding: '20px', borderRadius: 12,
            border: `2px dashed ${loading ? T.bd : 'rgba(34,197,94,0.3)'}`,
            background: loading ? T.s : 'rgba(34,197,94,0.04)',
            color: loading ? T.tx3 : '#22C55E', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
            minHeight: 56, transition: 'all 0.2s',
            opacity: loading ? 0.6 : 1, pointerEvents: loading ? 'none' : 'auto',
          }}>
            {loading ? msg || 'Processing…' : 'Upload .xlsx or .csv'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleFile} style={{ display: 'none' }} />

          <div style={{ marginTop: 22, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>The CSV will mark each SKU as</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: T.tx2 }}><strong style={{ color: T.tx }}>Active</strong> — in stock at Arya Designs</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: T.tx2 }}><strong style={{ color: T.tx }}>Inactive</strong> — currently out of stock</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.tx3, flexShrink: 0, marginTop: 4 }} />
              <span style={{ fontSize: 12, color: T.tx2 }}><strong style={{ color: T.tx }}>Not Found</strong> — this SKU doesn't match any Arya Designs SKU. Please double-check it, or contact the admin for help.</span>
            </div>
          </div>

          {!loading && msg && (
            <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8, fontSize: 12, color: '#22C55E' }}>
              {msg}
            </div>
          )}
          {error && (
            <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: T.re }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

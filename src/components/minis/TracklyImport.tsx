import { useState, useRef } from 'react';
import { T } from '../../lib/theme';
import { SUPABASE_ANON_KEY } from '../../lib/supabase';

const EDGE = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/short-track';

type Result = { input: string; sku: string | null; name: string | null; category: string | null; is_active: boolean | null; match: string; size?: string };

export default function TracklyImport({ onBack }: { onBack: () => void }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const lookup = async (skus: string[]) => {
    const clean = skus.map(s => s.trim()).filter(Boolean);
    if (!clean.length) { setError('Paste at least one SKU'); return; }
    if (clean.length > 500) { setError('Maximum 500 SKUs per lookup'); return; }
    setLoading(true); setError(''); setResults([]);
    try {
      const res = await fetch(EDGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'lookup', skus: clean }),
      });
      const data = await res.json();
      if (data.ok) setResults(data.results);
      else setError(data.error || 'Lookup failed');
    } catch { setError('Network error — please try again'); }
    setLoading(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
      const t = await file.text();
      const skus = t.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean);
      lookup(skus);
    } else {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);
      const skus = rows.map(r => String(r.sku || r.SKU || r.Sku || r['SKU Code'] || r['sku_code'] || Object.values(r)[0] || '').trim()).filter(Boolean);
      lookup(skus);
    }
    e.target.value = '';
  };

  const download = () => {
    const header = 'Input SKU,Matched SKU,Product,Category,Status,Match Type\n';
    const rows = results.map(r => [r.input, r.sku || '', r.name || '', r.category || '', r.match === 'not_found' ? 'Not Found' : r.is_active ? 'Active' : 'Inactive', r.match].join(',')).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sku-lookup.csv'; a.click();
  };

  const matchColor = (m: string, active: boolean | null) => {
    if (m === 'not_found') return '#EF4444';
    if (m === 'partial' || m === 'size_variant') return '#F59E0B';
    return active ? '#22C55E' : '#EF4444';
  };
  const matchLabel = (r: Result) => {
    if (r.match === 'not_found') return 'Not Found';
    if (r.match === 'size_variant') return `Size variant (${r.size})`;
    if (r.match === 'partial') return 'Partial match';
    return r.is_active ? 'Active' : 'Inactive';
  };

  const found = results.filter(r => r.match !== 'not_found').length;
  const active = results.filter(r => r.match !== 'not_found' && r.is_active).length;

  return (
    <div style={{ position: 'fixed', inset: 0, background: T.bg, fontFamily: T.sans, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: T.tx2, cursor: 'pointer', padding: 6, fontSize: 18, lineHeight: 1 }}>&larr;</button>
        <div style={{ fontFamily: 'Sora, Inter, sans-serif', fontSize: 15, fontWeight: 700, color: T.tx }}>SKU Lookup</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px', WebkitOverflowScrolling: 'touch', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {!results.length && (
          <div style={{ maxWidth: 500, margin: '0 auto' }}>
            <div style={{ fontSize: 12, color: T.tx2, marginBottom: 8 }}>Paste SKUs (one per line) or upload a file:</div>
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder={'TF243\nSW101\nTN-442XL\n...'} rows={8}
              style={{ width: '100%', background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 10, color: T.tx, fontFamily: T.mono, fontSize: 13, padding: '12px 14px', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={() => lookup(text.split('\n'))} disabled={loading}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(34,197,94,0.3)', background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))', color: '#22C55E', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48, opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none' : 'auto' }}>
                {loading ? 'Looking up…' : 'Look Up'}
              </button>
              <button onClick={() => fileRef.current?.click()}
                style={{ padding: '12px 16px', borderRadius: 10, border: `1px solid ${T.bd2}`, background: T.s, color: T.tx2, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48 }}>
                Upload
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
            {error && <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: T.re }}>{error}</div>}
          </div>
        )}

        {results.length > 0 && (
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: T.tx3 }}>{results.length} SKUs &middot; {found} matched &middot; {active} active</div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={download} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: T.s, color: T.tx2, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Download CSV</button>
                <button onClick={() => { setResults([]); setText(''); }} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: T.s, color: T.tx2, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>New Lookup</button>
              </div>
            </div>
            {results.map((r, i) => (
              <div key={i} style={{ padding: '12px 14px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 10, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: matchColor(r.match, r.is_active), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: T.tx, fontFamily: T.mono, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.input}</div>
                  {r.sku && <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{r.name}{r.category ? ` · ${r.category}` : ''}</div>}
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: matchColor(r.match, r.is_active), textAlign: 'right', flexShrink: 0 }}>{matchLabel(r)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

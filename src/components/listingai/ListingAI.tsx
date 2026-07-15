// Listing AI — fills marketplace listing sheets (Myntra / Ajio / Amazon /
// Shopify) from the offline master sheet + one Dropbox photo per SKU, via the
// listing-ai edge function. Pick a saved template → paste SKUs → Generate →
// export the filled sheet in the template's exact column order. Price-like
// columns are always left blank (enforced server-side).
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import Empty from '../ui/Empty';
import { call, GenRow, GenUsage } from './api';
import { parseSkuLines } from './skuInput';
import TemplateManager from './TemplateManager';
import MappingsManager from './MappingsManager';
import ImageFolders from './ImageFolders';
import ResultsTable from './ResultsTable';
import type { ListingTemplate } from '../../types/database';

const CHUNK = 3;    // SKUs per edge call (server caps at 5) — keeps each call fast
const RUN_CAP = 60; // SKUs per run, so one tap can't burn an unbounded API bill

export default function ListingAI({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [status, setStatus] = useState<{ hasKey: boolean; role: string } | null>(null);
  const [statusErr, setStatusErr] = useState('');
  const [templates, setTemplates] = useState<ListingTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [skuText, setSkuText] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [mappingsOpen, setMappingsOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [headers, setHeaders] = useState<string[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [rows, setRows] = useState<GenRow[]>([]);
  const [usage, setUsage] = useState<GenUsage | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const { status: st, data } = await call({ action: 'status' });
      if (data?.ok) { setStatus({ hasKey: !!data.hasKey, role: String(data.role || '') }); setStatusErr(''); }
      else setStatusErr(String(data?.details || data?.error || `Failed (${st})`));
    } catch (e) { setStatusErr(friendlyError(e)); }
  }, []);

  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase.from('listing_templates')
      .select('id, name, marketplace, fields, file_name, sheet_name, header_row, updated_at').order('name');
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setTemplates((data as ListingTemplate[] | null) || []);
  }, [addToast]);

  useEffect(() => { loadStatus(); loadTemplates(); }, [loadStatus, loadTemplates]);

  const isAdmin = status?.role === 'admin';
  const selected = templates.find(t => t.id === selectedId);
  const skuCount = parseSkuLines(skuText).length;

  const generate = async () => {
    if (generating) return;
    if (!selected) { addToast('Pick a template first', 'error'); return; }
    let skus = parseSkuLines(skuText);
    if (skus.length === 0) { addToast('Paste at least one SKU', 'error'); return; }
    if (skus.length > RUN_CAP) { addToast(`Capped to the first ${RUN_CAP} SKUs (of ${skus.length}) — run again for the rest`, 'error'); skus = skus.slice(0, RUN_CAP); }
    setGenerating(true);
    setRows([]); setHeaders([]); setKinds([]); setUsage(null);
    setProgress({ done: 0, total: skus.length });
    const acc: GenRow[] = [];
    const tot: GenUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    try {
      for (let i = 0; i < skus.length; i += CHUNK) {
        const chunk = skus.slice(i, i + CHUNK);
        let data: any, st = 0;
        try { ({ status: st, data } = await call({ action: 'generate', items: chunk, templateId: selected.id })); }
        catch (e) { addToast(friendlyError(e), 'error'); break; }
        if (!data?.ok) {
          addToast(data?.error === 'no_api_key'
            ? (isAdmin ? 'Add the Anthropic API key in Settings → Listing AI first' : 'No API key configured — ask an admin to add it in Settings → Listing AI')
            : String(data?.details || data?.error || `Failed (${st})`), 'error');
          break;
        }
        setHeaders(data.headers || []); setKinds(data.kinds || []);
        acc.push(...((data.rows || []) as GenRow[]));
        const u = data.usage || {};
        tot.input_tokens += u.input_tokens || 0;
        tot.output_tokens += u.output_tokens || 0;
        tot.cache_read_input_tokens += u.cache_read_input_tokens || 0;
        tot.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
        setRows([...acc]); setUsage({ ...tot });
        setProgress({ done: Math.min(i + CHUNK, skus.length), total: skus.length });
        for (const w of (data.warnings || []) as string[]) addToast(w, 'error');
      }
      if (acc.length > 0) {
        const okCount = acc.filter(r => r.status === 'ok').length;
        addToast(`${okCount} of ${acc.length} SKU(s) generated`, okCount > 0 ? 'success' : 'error');
      }
    } finally { setGenerating(false); }
  };

  if (statusErr) return <Empty icon="warning" title="Listing AI unavailable" message={statusErr} cta="Retry" onCta={loadStatus} />;
  if (status && !['admin', 'manager'].includes(status.role)) {
    return <Empty icon="clipboard" title="Listing AI" message="Only admin and manager accounts can generate marketplace listings." />;
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Listing AI</div>
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
          Master sheet + Dropbox photo → filled marketplace sheet, fresh wording every run. Price columns always stay blank.
        </div>
      </div>
      {status && !status.hasKey && (
        <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: T.yl, marginBottom: 14 }}>
          {isAdmin
            ? 'No Anthropic API key configured yet — add it in Settings → Listing AI.'
            : 'No Anthropic API key configured yet — ask an admin to add it in Settings → Listing AI.'}
        </div>
      )}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={S.fLabel}>Marketplace template</div>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ ...S.fInput, width: '100%' }}>
              <option value="">{templates.length ? 'Choose a template…' : 'No templates yet'}</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.marketplace ? ` — ${t.marketplace}` : ''} ({t.fields.length} fields)</option>)}
            </select>
          </div>
          <button onClick={() => setManageOpen(true)} style={S.btnGhost}>Manage Templates</button>
          <button onClick={() => setMappingsOpen(true)} style={S.btnGhost}>Taught Mappings</button>
          <button onClick={() => setLinksOpen(true)} style={S.btnGhost}>Image Folders</button>
        </div>
        <div style={S.fLabel}>SKUs — one per line</div>
        <textarea
          value={skuText}
          onChange={e => setSkuText(e.target.value)}
          placeholder={'AD-1001\nDT-2044\nAD-1010'}
          rows={4}
          style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 84, resize: 'vertical', fontFamily: T.mono, lineHeight: 1.6 }}
        />
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 4, lineHeight: 1.5 }}>
          Photos are found automatically: each SKU's subfolder inside your saved Image Folders → the master sheet's IMAGE link → Link Generator folders. Need a one-off override? Paste a folder link after the SKU on its line. Image columns fill in photo order (1st photo → Front Image).
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            onClick={generate}
            disabled={generating}
            style={{ ...S.btnPrimary, pointerEvents: generating ? 'none' : 'auto', opacity: generating ? 0.5 : 1 }}
          >
            {generating ? `Generating ${progress.done}/${progress.total}…` : `Generate${skuCount ? ` ${Math.min(skuCount, RUN_CAP)} SKU${skuCount > 1 ? 's' : ''}` : ''}`}
          </button>
          {generating && <span style={{ fontSize: 11, color: T.tx3 }}>Fetching data, photos and writing listings — stay on this screen…</span>}
        </div>
      </div>
      {rows.length > 0 && selected && (
        <ResultsTable headers={headers} kinds={kinds} rows={rows} usage={usage} template={selected} addToast={addToast} />
      )}
      <TemplateManager open={manageOpen} onClose={() => { setManageOpen(false); loadTemplates(); }} templates={templates} refresh={loadTemplates} addToast={addToast} />
      <MappingsManager open={mappingsOpen} onClose={() => setMappingsOpen(false)}
        fields={selected?.fields || [...new Map(templates.flatMap(t => t.fields).map(f => [f.header, f])).values()]} addToast={addToast} />
      <ImageFolders open={linksOpen} onClose={() => setLinksOpen(false)} addToast={addToast} />
    </div>
  );
}

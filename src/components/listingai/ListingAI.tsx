// Listing AI — fills marketplace listing sheets (Myntra / Ajio / Amazon /
// Shopify) from the offline master sheet + one Dropbox photo per SKU, via the
// listing-ai edge function. Pick a saved template → paste SKUs → Generate →
// export the filled sheet in the template's exact column order. Price-like
// columns are never AI-written - the owner fills them via fixed values,
// pairing, wires or rules (enforced server-side). Runs are saved for
// 5 days (Recent runs) so a reload never loses a generated sheet.
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import Empty from '../ui/Empty';
import MasterFreshness from '../ui/MasterFreshness';
import { call } from './api';
import { parseSkuLines } from './skuInput';
import { HANDOFF_EVENT, readListingHandoff } from './listingHandoff';
import { useBackClose } from '../../hooks/useBackClose';
import { RUN_CAP, useGenerateRun } from './useGenerateRun';
import { useAutoBatch } from './useAutoBatch';
import HandoffBanner from './HandoffBanner';
import TemplateManager from './TemplateManager';
import TaughtMappingsPage from './TaughtMappingsPage';
import BulkTeachPage from './bulk/BulkTeachPage';
import ImageFolders from './ImageFolders';
import ResultsTable from './ResultsTable';
import PreflightPanel from './PreflightPanel';
import RunHistory from './RunHistory';
import type { ListingTemplate } from '../../types/database';

export default function ListingAI({ addToast, active = true }: { addToast: (m: string, t?: string) => void; active?: boolean }) {
  const [status, setStatus] = useState<{ hasKey: boolean; role: string } | null>(null);
  const [statusErr, setStatusErr] = useState('');
  const [templates, setTemplates] = useState<ListingTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [skuText, setSkuText] = useState('');
  const [viewMode, setViewMode] = useState<'main' | 'mappings' | 'bulk' | 'assistant'>('main');
  const [manageOpen, setManageOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [handoff, setHandoff] = useState<{ seller: string; count: number } | null>(null);
  const gen = useGenerateRun(addToast);
  const batch = useAutoBatch(gen, addToast);
  // busy = a run/queue/pending preflight owns the screen state.
  const busy = gen.generating || batch.active || !!gen.preflight;
  const busyRef = useRef(false);
  busyRef.current = busy;

  // Two owned levels so Back walks main ← mappings ← bulk one step at a time.
  // Before this the sub-pages had no history entry at all: Back skipped them
  // entirely and left the tab (or closed the PWA).
  useBackClose(viewMode !== 'main', () => setViewMode('main'));
  useBackClose(viewMode === 'bulk', () => setViewMode('mappings'));

  const loadStatus = useCallback(async () => {
    try {
      const { status: st, data } = await call({ action: 'status' });
      if (data?.ok) { setStatus({ hasKey: !!data.hasKey, role: String(data.role || '') }); setStatusErr(''); }
      else setStatusErr(String(data?.details || data?.error || `Failed (${st})`));
    } catch (e) { setStatusErr(friendlyError(e)); }
  }, []);

  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase.from('listing_templates')
      .select('id, name, marketplace, category, fields, rules, file_name, sheet_name, header_row, updated_at').order('name');
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setTemplates((data as ListingTemplate[] | null) || []);
  }, [addToast]);

  useEffect(() => { loadStatus(); loadTemplates(); }, [loadStatus, loadTemplates]);
  useEffect(() => { if (!active) setViewMode('main'); }, [active]);

  // SKU handoff from the Master Assistant ("Generate listings for
  // not-uploaded"). Read on mount (tab mounted fresh after the switch) AND on
  // the event (tab already mounted but hidden) — reading consumes the payload.
  // Context goes into the persistent banner, not a vanishing toast.
  useEffect(() => {
    const applyHandoff = () => {
      const h = readListingHandoff();
      if (!h) return;
      // Never replace the SKU box mid-run — the queue owns it right now.
      if (busyRef.current) { addToast('A generation is running — finish or stop it before sending new SKUs from Master Assistant', 'error'); return; }
      setViewMode('main');
      setSkuText(h.skus.join('\n'));
      setHandoff({ seller: h.seller, count: h.skus.length });
    };
    applyHandoff();
    window.addEventListener(HANDOFF_EVENT, applyHandoff);
    return () => window.removeEventListener(HANDOFF_EVENT, applyHandoff);
  }, []);

  const isAdmin = status?.role === 'admin';
  const selected = templates.find(t => t.id === selectedId);
  const skuCount = parseSkuLines(skuText).length;

  const generate = () => {
    if (!selected) { addToast('Pick a template first', 'error'); return; }
    const skus = parseSkuLines(skuText);
    if (skus.length === 0) { addToast('Paste at least one SKU', 'error'); return; }
    // Past the per-run cap the auto-queue runs the whole list batch-by-batch.
    if (skus.length > RUN_CAP) { batch.start(selected, skus, isAdmin); return; }
    gen.generate(selected, skus, isAdmin);
  };

  if (statusErr) return <Empty icon="warning" title="Listing AI unavailable" message={statusErr} cta="Retry" onCta={loadStatus} />;
  if (status && !['admin', 'manager'].includes(status.role)) {
    return <Empty icon="clipboard" title="Listing AI" message="Only admin and manager accounts can generate marketplace listings." />;
  }

  if (viewMode === 'bulk') {
    return (
      <BulkTeachPage
        onBack={() => setViewMode('mappings')}
        templates={templates}
        initialTemplateId={selectedId}
        addToast={addToast}
      />
    );
  }

  if (viewMode === 'mappings') {
    return (
      <TaughtMappingsPage
        onBack={() => setViewMode('main')}
        onBulk={() => setViewMode('bulk')}
        fields={selected?.fields || [...new Map(templates.flatMap(t => t.fields).map(f => [f.header, f])).values()]}
        addToast={addToast}
      />
    );
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Listing AI</div>
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
          Master sheet + Dropbox photo → filled Listing Template, fresh wording every run. Price columns are never AI-written — you fill or skip them.
        </div>
      </div>
      {status && !status.hasKey && (
        <div style={{ background: 'oklch(0.78 0.18 75 / .06)', border: '1px solid oklch(0.78 0.18 75 / .2)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: T.yl, marginBottom: 14 }}>
          {isAdmin
            ? 'No Anthropic API key configured yet — add it in Settings → Listing AI.'
            : 'No Anthropic API key configured yet — ask an admin to add it in Settings → Listing AI.'}
        </div>
      )}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16 }}>
        <MasterFreshness />
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={S.fLabel}>Listing Template</div>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ ...S.fInput, width: '100%' }}>
              <option value="">{templates.length ? 'Choose a template…' : 'No templates yet'}</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.marketplace ? ` — ${t.marketplace}` : ''} ({t.fields.length} fields)</option>)}
            </select>
          </div>
          <button onClick={() => setManageOpen(true)} style={S.btnGhost}>Manage Templates</button>
          {/* Leaving the main view mid-run would hide the preflight panel and
              the Stop button — the queue would hang invisibly. */}
          <button onClick={() => setViewMode('mappings')} disabled={busy} title={busy ? 'Wait for the current generation to finish' : undefined}
            style={{ ...S.btnGhost, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>Taught Mappings</button>
          <button onClick={() => setLinksOpen(true)} style={S.btnGhost}>Image Folders</button>
        </div>
        {(handoff || batch.active) && (
          <HandoffBanner seller={handoff?.seller ?? null} count={handoff?.count ?? 0}
            batch={batch.active ? { current: batch.current, total: batch.total } : null}
            stopping={batch.stopping} onStop={batch.stop} onDismiss={() => setHandoff(null)} />
        )}
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
            disabled={busy}
            style={{ ...S.btnPrimary, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}
          >
            {batch.active ? `Batch ${batch.current}/${batch.total} — ${gen.generating ? `${gen.progress.done}/${gen.progress.total}…` : 'pre-checking…'}`
              : gen.generating ? `Generating ${gen.progress.done}/${gen.progress.total}…`
              : `Generate${skuCount ? ` ${skuCount} SKU${skuCount > 1 ? 's' : ''}${skuCount > RUN_CAP ? ` (${Math.ceil(skuCount / RUN_CAP)} batches)` : ''}` : ''}`}
          </button>
          {(gen.generating || batch.active) && <span style={{ fontSize: 11, color: T.tx3 }}>Fetching data, photos and writing listings — stay on this screen…</span>}
        </div>
      </div>
      {gen.preflight && (
        <PreflightPanel issues={gen.preflight.issues} generating={gen.generating} onConfirm={gen.confirmPreflight} />
      )}
      {gen.rows.length > 0 && gen.runTpl && (
        <ResultsTable headers={gen.headers} kinds={gen.kinds} rows={gen.rows} usage={gen.usage} cost={gen.cost} template={gen.runTpl} addToast={addToast} />
      )}
      <RunHistory templates={templates} refreshKey={gen.savedCount} onOpen={gen.loadRun} addToast={addToast} busy={busy} />
      <TemplateManager open={manageOpen} onClose={() => { setManageOpen(false); loadTemplates(); }} templates={templates} refresh={loadTemplates} addToast={addToast} />
      <ImageFolders open={linksOpen} onClose={() => setLinksOpen(false)} addToast={addToast} />
    </div>
  );
}

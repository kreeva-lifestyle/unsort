// Bulk Teach — full-page reconciliation of the master sheet against one
// template's dropdown columns. The scan runs server-side on the live master
// Google Sheet with the exact matching logic runs use; only values that
// NEED the owner are listed (auto-matched / taught / ignored stay hidden),
// so the board only ever shrinks. Teach + Ignore stage locally; Save writes
// them in one RPC batch. AI suggestions are strictly on demand, per column
// or for everything, and never save without a tap.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import ColumnCard from './ColumnCard';
import { ScanColumn, StagedLesson, lessonKey, scanMappings, suggestMappings } from './bulkApi';
import type { ListingTemplate } from '../../../types/database';

export default function BulkTeachPage({ onBack, templates, initialTemplateId, addToast }: {
  onBack: () => void;
  templates: ListingTemplate[];
  initialTemplateId: string;
  addToast: (m: string, t?: string) => void;
}) {
  const [templateId, setTemplateId] = useState(initialTemplateId || templates[0]?.id || '');
  const [columns, setColumns] = useState<ScanColumn[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [staged, setStaged] = useState<Record<string, StagedLesson>>({});
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [suggestingCol, setSuggestingCol] = useState(''); // header, or '*' for all
  const [saving, setSaving] = useState(false);

  const tpl = templates.find(t => t.id === templateId);
  const allowedOf = useCallback((header: string) =>
    tpl?.fields.find(f => f.header === header)?.allowed || [], [tpl]);

  const scan = useCallback(async (id: string) => {
    if (!id) { setColumns(null); return; }
    setScanning(true);
    setColumns(null);
    try {
      const { columns: cols, warnings } = await scanMappings(id);
      setColumns(cols);
      for (const w of warnings || []) addToast(w, 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setScanning(false);
  }, [addToast]);

  useEffect(() => { scan(templateId); setStaged({}); setSuggestions({}); }, [templateId, scan]);

  // Staged lessons are only local until Save — warn before losing them.
  const stagedList = Object.values(staged);
  useEffect(() => {
    if (stagedList.length === 0) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [stagedList.length]);

  const stage = (col: ScanColumn, source: string, target: string, ignored: boolean) =>
    setStaged(st => ({ ...st, [lessonKey(col.fieldKey, source)]: { field_key: col.fieldKey, field_label: col.header, source, target, ignored } }));
  const unstage = (col: ScanColumn, source: string) =>
    setStaged(st => { const n = { ...st }; delete n[lessonKey(col.fieldKey, source)]; return n; });

  const pendingOf = (col: ScanColumn) =>
    [...col.stale.map(s => s.source), ...col.unmatched.map(u => u.value)]
      .filter(v => !staged[lessonKey(col.fieldKey, v)]);

  const suggest = async (cols: ScanColumn[], label: string) => {
    const reqs = cols.map(c => ({ col: c, values: pendingOf(c) })).filter(r => r.values.length);
    if (!reqs.length || suggestingCol) return;
    setSuggestingCol(label);
    try {
      let got = 0, unsureTotal = 0, usd = 0;
      // One call per column keeps every call under the server's 300-value cap.
      for (const r of reqs) {
        const { suggestions: sugg, unsure, estUsd } = await suggestMappings(templateId, [{ header: r.col.header, values: r.values }]);
        setSuggestions(sg => ({ ...sg, ...Object.fromEntries(sugg.map(s => [lessonKey(r.col.fieldKey, s.source), s.target])) }));
        got += sugg.length; unsureTotal += unsure; usd += estUsd;
      }
      addToast(`AI suggested ${got} value(s)${unsureTotal ? ` — unsure about ${unsureTotal}, pick those manually` : ''} · cost $${usd.toFixed(3)}. Review, then Teach.`, 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSuggestingCol('');
  };

  const save = async () => {
    if (!stagedList.length || saving) return;
    setSaving(true);
    try {
      for (let i = 0; i < stagedList.length; i += 500) {
        const { error } = await supabase.rpc('teach_bulk', { p_lessons: stagedList.slice(i, i + 500) });
        if (error) { addToast(friendlyError(error), 'error'); setSaving(false); return; }
      }
      const taught = stagedList.filter(l => !l.ignored).length;
      const ignored = stagedList.length - taught;
      addToast(`${taught} lesson(s) taught${ignored ? `, ${ignored} ignored` : ''} — they apply on every future run, free`, 'success');
      setStaged({}); setSuggestions({});
      scan(templateId);
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  const needy = (columns || []).filter(c => c.unmatched.length + c.stale.length > 0).sort((a, b) => (b.unmatched.length + b.stale.length) - (a.unmatched.length + a.stale.length));
  const settled = (columns || []).filter(c => c.unmatched.length + c.stale.length === 0);
  const totals = (columns || []).reduce((t, c) => ({ auto: t.auto + c.auto, taught: t.taught + c.taught, need: t.need + c.unmatched.length + c.stale.length, ignored: t.ignored + c.ignored }), { auto: 0, taught: 0, need: 0, ignored: 0 });

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ ...S.btnGhost, ...S.btnSm }}>&larr; Back</button>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Bulk Teach</div>
        <select value={templateId} onChange={e => setTemplateId(e.target.value)} style={{ ...S.fInput, minWidth: 160, flex: '0 1 220px' }}>
          {!templateId && <option value="">Choose a template…</option>}
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button onClick={() => scan(templateId)} disabled={scanning} style={{ ...S.btnGhost, ...S.btnSm, opacity: scanning ? 0.5 : 1, pointerEvents: scanning ? 'none' : 'auto' }}>&#8635; Rescan</button>
          <button onClick={save} disabled={!stagedList.length || saving} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: stagedList.length && !saving ? 1 : 0.4 }}>
            {saving ? 'Saving…' : `Save ${stagedList.length || ''} staged`}
          </button>
        </span>
      </div>
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12, lineHeight: 1.5 }}>
        Every distinct master-sheet value, checked against this template's dropdown columns. Values that already match, are taught, or were ignored stay hidden — only the ones that need you are shown. Saved lessons apply to every template sharing the column, at zero AI cost.
      </div>
      {columns && columns.length > 0 && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '11px 14px', marginBottom: 12, alignItems: 'center' }}>
          {([[T.gr, totals.auto, 'match automatically'], [T.ac2, totals.taught, 'already taught'], [T.re, totals.need, 'need you'], [T.tx3, totals.ignored, 'ignored']] as const).map(([c, n, l]) => (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.tx2 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} /><b style={{ color: T.tx, fontFamily: T.mono }}>{n}</b> {l}
            </span>
          ))}
          {totals.need > 0 && needy.reduce((s, c) => s + pendingOf(c).length, 0) > 0 && (
            <button onClick={() => suggest(needy, '*')} style={{ ...S.btnGhost, ...S.btnSm, color: T.yl, border: '1px solid rgba(245,158,11,.25)', marginLeft: 'auto', pointerEvents: suggestingCol ? 'none' : 'auto', opacity: suggestingCol ? 0.5 : 1 }}>
              {suggestingCol === '*' ? 'Suggesting…' : <>&#10022; Suggest all</>}
            </button>
          )}
        </div>
      )}
      {scanning && <div style={{ padding: '40px 0', textAlign: 'center', color: T.tx3, fontSize: 12 }}>Scanning the master sheet — both brand tabs, every row…</div>}
      {!scanning && columns && columns.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: T.tx3, fontSize: 12 }}>
          This template has no dropdown columns that pair with a master column — there is nothing to teach here.
        </div>
      )}
      {!scanning && needy.map((c, i) => (
        <ColumnCard key={c.header} col={c} allowed={allowedOf(c.header)} staged={staged} suggestions={suggestions}
          defaultOpen={i === 0} suggesting={suggestingCol === c.header || suggestingCol === '*'}
          onStage={(src, t) => stage(c, src, t, false)} onIgnore={src => stage(c, src, '', true)} onUnstage={src => unstage(c, src)}
          onSuggest={() => suggest([c], c.header)} />
      ))}
      {!scanning && settled.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: '.1em', margin: '18px 0 8px' }}>All caught up — {settled.length} column(s)</div>
          {settled.map(c => (
            <ColumnCard key={c.header} col={c} allowed={allowedOf(c.header)} staged={staged} suggestions={suggestions}
              defaultOpen={false} suggesting={false}
              onStage={(src, t) => stage(c, src, t, false)} onIgnore={src => stage(c, src, '', true)} onUnstage={src => unstage(c, src)}
              onSuggest={() => suggest([c], c.header)} />
          ))}
        </>
      )}
    </div>
  );
}

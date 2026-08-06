// Master Assistant — chat over the offline master sheet, optionally against
// an uploaded seller/marketplace sheet ("which products are live?", "what
// has the seller not uploaded?"). Every number comes from the edge fn's
// code-computed comparison pack; the AI (the owner's Settings model) only
// interprets the question and narrates. Complete result tables render under
// each answer with CSV export (AnswerBlock.tsx).
import { useState, useRef, useEffect } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { call } from '../api';
import { parseSellerSheet, SellerSheet } from './sellerSheetParse';
import { AssistantTable } from './AssistantTables';
import { buildComparisonReport, ComparisonReport } from './buildReport';
import AnswerBlock, { Msg } from './AnswerBlock';

// The chat renders raw text; the model is told plain-text-only but a slipped
// markdown token must not show as # / ** noise — strip the common ones.
export const plainText = (t: string): string => t
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/__(.+?)__/g, '$1')
  .replace(/^\s*---+\s*$/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const SHEET_IDEAS = ['Which of these are live and which are not?', 'Which products has this seller NOT uploaded?', "Any SKUs in this sheet that aren't ours?"];
const MASTER_IDEAS = ['How many designs per brand are in the master?', 'What is the category spread?', 'How many DRS designs do we have?'];

export default function MasterAssistant({ onBack, addToast, openListingAI }: {
  onBack: () => void;
  addToast: (m: string, t?: string) => void;
  openListingAI?: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sheet, setSheet] = useState<SellerSheet | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileTokenRef = useRef(0); // two rapid attaches race — only the LATEST read may apply
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [msgs, busy]);

  const pickFile = (f: File) => {
    const token = ++fileTokenRef.current;
    const reader = new FileReader();
    reader.onload = ev => {
      if (token !== fileTokenRef.current) return;
      try {
        const p = parseSellerSheet(ev.target?.result as ArrayBuffer, f.name);
        setSheet(p);
        for (const w of p.warnings) addToast(w, 'error');
        if (p.warnings.length === 0) addToast(`${p.name}: ${p.rows.length} rows attached — ask away`, 'success');
      } catch (e) { addToast(friendlyError(e), 'error'); }
    };
    // A silent read failure would leave the PREVIOUS sheet attached while the
    // owner believes the new one is — say it loudly.
    reader.onerror = () => { if (token === fileTokenRef.current) addToast(`Could not read ${f.name} — try attaching it again`, 'error'); };
    reader.readAsArrayBuffer(f);
  };

  const send = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setBusy(true);
    setInput('');
    setMsgs(m => [...m, { role: 'user', text: question }]);
    try {
      const history = msgs.slice(-6).map(m => ({ role: m.role, text: m.text }));
      const { status, data } = await call({
        action: 'assistant', question, history,
        seller: sheet ? { name: sheet.name, headers: sheet.headers, rows: sheet.rows, totalRows: sheet.totalRows } : undefined,
      });
      if (!data?.ok) {
        if (data?.error === 'no_api_key') throw new Error('Add the Anthropic API key in Settings → Listing AI first');
        throw new Error(String(data?.details || data?.error || `Failed (${status})`));
      }
      const tables = (data.tables || []) as AssistantTable[];
      const warnings = [...(sheet?.warnings || []), ...((data.warnings || []) as string[])];
      // One-workbook seller report — built from the exact comparison the edge
      // just computed plus the sheet that produced it (only when one's
      // attached). Its OWN try: a report-build throw must not discard the
      // paid answer. Truncation warnings ride into the workbook Summary.
      let report: ComparisonReport | null = null;
      if (sheet) {
        try { report = buildComparisonReport(tables, sheet, warnings); }
        catch { addToast('Could not build the Excel report — the tables below still have everything', 'error'); }
      }
      setMsgs(m => [...m, { role: 'assistant', text: plainText(String(data.answer || '')), tables, report, warnings, estUsd: Number(data.estUsd || 0) }]);
    } catch (e) {
      addToast(friendlyError(e), 'error');
      setMsgs(m => m.slice(0, -1)); // question stays in the box for a retry
      setInput(prev => prev || question); // never clobber text typed while waiting
    }
    setBusy(false);
  };

  const idea = (q: string) => (
    <button key={q} onClick={() => send(q)} disabled={busy}
      style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, fontSize: 11, textAlign: 'left', opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>{q}</button>
  );

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36 }}>← Back</button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Master Assistant</div>
          <div style={{ fontSize: 11, color: T.tx3 }}>Ask about the master sheet — attach a seller sheet to compare. Counts are computed exactly; the AI explains.</div>
        </div>
      </div>

      {/* attached-sheet chip */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }} />
        {sheet ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'oklch(0.72 0.19 145 / .08)', border: '1px solid oklch(0.72 0.19 145 / .25)', fontSize: 11, color: T.gr }}>
            {sheet.name} · {sheet.rows.length} rows · {sheet.headers.length} columns
            <button onClick={() => setSheet(null)} title="Detach sheet" aria-label="Detach sheet" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>&#215;</button>
          </span>
        ) : (
          <button onClick={() => fileRef.current?.click()} style={{ ...S.btnGhost, minHeight: 44 }}>+ Attach seller sheet (Excel/CSV)</button>
        )}
        {sheet && <button onClick={() => fileRef.current?.click()} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36 }}>Replace</button>}
      </div>

      {/* conversation */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 12, minHeight: 200 }}>
        {msgs.length === 0 && (
          <div style={{ padding: '18px 6px' }}>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 8, textAlign: 'center' }}>Tap a question, or type your own.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {(sheet ? SHEET_IDEAS : MASTER_IDEAS).map(idea)}
            </div>
            {!sheet && <div style={{ fontSize: 10, color: T.tx3, marginTop: 10, textAlign: 'center' }}>Attach a seller sheet above to compare it against the master.</div>}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            {m.role === 'user' ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 10, background: 'oklch(0.55 0.22 265 / .12)', border: '1px solid oklch(0.55 0.22 265 / .25)', fontSize: 12, color: T.tx, whiteSpace: 'pre-wrap' }}>{m.text}</div>
              </div>
            ) : (
              <AnswerBlock msg={m} addToast={addToast} openListingAI={openListingAI} />
            )}
          </div>
        ))}
        {busy && <div style={{ fontSize: 11, color: T.tx3, padding: '4px 2px' }}>Reading the master sheet and thinking…</div>}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={sheet ? `Ask about ${sheet.name} vs the master…` : 'Ask about the master sheet…'}
          style={{ ...S.fInput, flex: 1, height: 'auto', minHeight: 56, resize: 'vertical', lineHeight: 1.5 }} />
        <button onClick={() => send()} disabled={busy || !input.trim()}
          style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy || !input.trim() ? 0.5 : 1 }}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </div>
    </div>
  );
}

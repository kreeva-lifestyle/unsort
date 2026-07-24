// Master Assistant — chat over the offline master sheet, optionally against
// an uploaded seller/marketplace sheet ("which products are live?", "what
// has the seller not uploaded?"). Every number comes from the edge fn's
// code-computed comparison pack; the AI (the owner's Settings model) only
// interprets the question and narrates. Complete result tables render under
// each answer with CSV export.
import { useState, useRef, useEffect } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { call } from '../api';
import { parseSellerSheet, SellerSheet } from './sellerSheetParse';
import AssistantTables, { AssistantTable } from './AssistantTables';

interface Msg { role: 'user' | 'assistant'; text: string; tables?: AssistantTable[]; estUsd?: number }

// The chat renders raw text; the model is told plain-text-only but a slipped
// markdown token must not show as # / ** noise — strip the common ones.
export const plainText = (t: string): string => t
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/__(.+?)__/g, '$1')
  .replace(/^\s*---+\s*$/gm, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export default function MasterAssistant({ onBack, addToast }: {
  onBack: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sheet, setSheet] = useState<SellerSheet | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [msgs, busy]);

  const pickFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const p = parseSellerSheet(ev.target?.result as ArrayBuffer, f.name);
        setSheet(p);
        if (p.totalRows > p.rows.length) addToast(`Sheet has ${p.totalRows} rows — using the first ${p.rows.length}`, 'error');
        else addToast(`${p.name}: ${p.rows.length} rows attached — ask away`, 'success');
      } catch (e) { addToast(friendlyError(e), 'error'); }
    };
    reader.readAsArrayBuffer(f);
  };

  const send = async () => {
    const question = input.trim();
    if (!question || busy) return;
    setBusy(true);
    setInput('');
    setMsgs(m => [...m, { role: 'user', text: question }]);
    try {
      const history = msgs.slice(-6).map(m => ({ role: m.role, text: m.text }));
      const { status, data } = await call({
        action: 'assistant', question, history,
        seller: sheet ? { name: sheet.name, headers: sheet.headers, rows: sheet.rows } : undefined,
      });
      if (!data?.ok) {
        if (data?.error === 'no_api_key') throw new Error('Add the Anthropic API key in Settings → Listing AI first');
        throw new Error(String(data?.details || data?.error || `Failed (${status})`));
      }
      setMsgs(m => [...m, { role: 'assistant', text: plainText(String(data.answer || '')), tables: (data.tables || []) as AssistantTable[], estUsd: Number(data.estUsd || 0) }]);
      for (const w of (data.warnings || []) as string[]) addToast(w, 'error');
    } catch (e) {
      addToast(friendlyError(e), 'error');
      setMsgs(m => m.slice(0, -1)); // question stays in the box for a retry
      setInput(question);
    }
    setBusy(false);
  };

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
            {sheet.name} · {sheet.rows.length} rows
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
          <div style={{ padding: '24px 10px', textAlign: 'center', color: T.tx3, fontSize: 11, lineHeight: 1.7 }}>
            Try: &ldquo;Which of these are live and which are not?&rdquo; · &ldquo;Which products has this seller NOT uploaded?&rdquo; · &ldquo;Any SKUs in this sheet that aren&rsquo;t ours?&rdquo;<br />
            Without a sheet: &ldquo;How many designs per brand are in the master?&rdquo;
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            {m.role === 'user' ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 10, background: 'oklch(0.55 0.22 265 / .12)', border: '1px solid oklch(0.55 0.22 265 / .25)', fontSize: 12, color: T.tx, whiteSpace: 'pre-wrap' }}>{m.text}</div>
              </div>
            ) : (
              <div style={{ maxWidth: '95%' }}>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: T.s2, border: `1px solid ${T.bd}`, fontSize: 12, color: T.tx2, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{m.text}</div>
                {m.tables && <AssistantTables tables={m.tables} />}
                {!!m.estUsd && <div style={{ fontSize: 9, color: T.tx3, marginTop: 3, fontFamily: T.mono }}>~${m.estUsd.toFixed(4)}</div>}
              </div>
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
        <button onClick={send} disabled={busy || !input.trim()}
          style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy || !input.trim() ? 0.5 : 1 }}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </div>
    </div>
  );
}

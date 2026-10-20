// "Report a problem" (header, every screen): one tap takes what was on
// screen, then the sheet asks only what kind of problem it is — a note and a
// photo are optional. "My reports" shows each report's progress. Reports are
// picked up by a scheduled Claude Code session; a fix goes live only after an
// admin approves it (Settings → Problem reports).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import { useAuth } from '../../hooks/useAuth';
import { KINDS, STATUS_LABEL, myReports, sendReport, snapshotPage, type IssueReport, type PageSnapshot, type ReportKind } from './reportApi';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function ReportSheet({ snap, onClose, addToast }: { snap: PageSnapshot; onClose: () => void; addToast: (m: string, t?: string) => void }) {
  useModalLock();
  useBackClose(true, onClose);
  const { profile } = useAuth();
  const [tab, setTab] = useState<'new' | 'mine'>('new');
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [note, setNote] = useState('');
  const [picture, setPicture] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [mine, setMine] = useState<IssueReport[] | null>(null);

  useEffect(() => {
    if (tab !== 'mine') return;
    let live = true;
    myReports().then(r => { if (live) setMine(r); }).catch(e => { if (live) { setMine([]); setErr(friendlyError(e)); } });
    return () => { live = false; };
  }, [tab]);

  const send = async () => {
    if (sending) return;
    if (!kind) { setErr('Pick what kind of problem it is'); return; }
    setSending(true); setErr('');
    try {
      await sendReport(snap, kind, note, picture, profile?.full_name || null);
      addToast('Problem sent — it will be looked at in the next check (twice a day)', 'success');
      onClose();
    } catch (e) { setErr(friendlyError(e)); addToast(friendlyError(e), 'error'); }
    finally { setSending(false); }
  };

  const tabBtn = (id: 'new' | 'mine', label: string) => (
    <button type="button" onClick={() => { setTab(id); setErr(''); }} style={{ flex: 1, minHeight: 40, borderRadius: 8, border: `1px solid ${tab === id ? T.ac : T.bd}`, background: tab === id ? T.ac3 : 'transparent', color: tab === id ? T.ac2 : T.tx2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
  );

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Report a problem</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 8 }}>{tabBtn('new', 'New report')}{tabBtn('mine', 'My reports')}</div>
          {tab === 'new' ? <>
            <div style={{ fontSize: 12, color: T.tx3, lineHeight: 1.5 }}>The screen you were on (<b style={{ color: T.tx2 }}>{snap.page}</b>), what it showed and any error messages are sent with it — no need to type them.</div>
            <div>
              <label style={S.fLabel}>What is it?</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {KINDS.map(k => (
                  <button key={k.id} type="button" onClick={() => { setKind(k.id); setErr(''); }} style={{ minHeight: 44, padding: '8px 12px', borderRadius: 8, border: `1px solid ${kind === k.id ? T.ac : T.bd2}`, background: kind === k.id ? T.ac3 : 'transparent', color: kind === k.id ? T.ac2 : T.tx2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{k.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={S.fLabel}>A few words (optional)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="e.g. the total shows ₹0 after I add an item" style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 72, resize: 'vertical', fontFamily: T.sans }} />
            </div>
            <div>
              <label style={S.fLabel}>Screenshot (optional)</label>
              <input type="file" accept="image/*" onChange={e => setPicture(e.target.files?.[0] || null)} style={{ fontSize: 12, color: T.tx2 }} aria-label="Screenshot" />
            </div>
            {err && <div style={S.errorBox}>{err}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
              <button type="button" onClick={send} style={{ ...S.btnPrimary, flex: 1, minHeight: 44, pointerEvents: sending ? 'none' : 'auto', opacity: sending ? 0.5 : 1 }}>{sending ? 'Sending…' : 'Send'}</button>
            </div>
          </> : <>
            {err && <div style={S.errorBox}>{err}</div>}
            {!mine ? <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Loading…</div>
              : !mine.length ? <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 12 }}>You have not reported anything yet.</div>
              : mine.map(r => (
                <div key={r.id} style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 10, fontSize: 12, lineHeight: 1.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: T.tx, fontWeight: 600 }}>{KINDS.find(k => k.id === r.kind)?.label} · {r.page}</span>
                    <span style={{ color: T.tx3, flexShrink: 0 }}>{when(r.created_at)}</span>
                  </div>
                  {r.note && <div style={{ color: T.tx2 }}>{r.note}</div>}
                  <div style={{ color: r.status === 'fixed' ? T.gr : r.status === 'fix_ready' || r.status === 'approved' ? T.yl : T.tx3, fontWeight: 600 }}>{STATUS_LABEL[r.status]}</div>
                  {r.summary && <div style={{ color: T.tx2 }}>{r.summary}</div>}
                </div>
              ))}
          </>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The header button: takes the screen first, then opens the sheet. */
export default function ReportProblemButton({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [snap, setSnap] = useState<PageSnapshot | null>(null);
  return (<>
    <button type="button" onClick={() => setSnap(snapshotPage())} aria-label="Report a problem" title="Report a problem"
      style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.bd2}`, background: 'transparent', cursor: 'pointer', color: T.tx, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M4 22V4a1 1 0 011-1h12l-2 4 2 4H5" /></svg>
    </button>
    {snap && <ReportSheet snap={snap} onClose={() => setSnap(null)} addToast={addToast} />}
  </>);
}

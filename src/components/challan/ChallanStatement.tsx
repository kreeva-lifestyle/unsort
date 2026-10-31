// The customer ledger as a statement (owner-approved design, 2026-10-31):
// one big "to collect", the sum that gets there, then three tabs — every
// bill / return / payment in date order with the running balance, the bills
// still open, and the plain challan list (tap to open, as before). Data from
// customer_statement() via statementData.ts; the PDF is statementPdf.ts.
import { useEffect, useState, type ReactNode } from 'react';
import { T, S, alpha } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { loadStatement, closingLabel, dayLabel, inr, statementWhatsApp, type Statement } from './statementData';
import { waLink, waPhone } from '../../lib/whatsapp';
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import { statementPdfHtml } from './statementPdf';

type Tab = 'days' | 'open' | 'all';

export default function ChallanStatement({ customerId, customerName, phone, from, to, challanList, onPdf, refreshOn }: {
  customerId: string | null;
  customerName: string;
  /** Customer's mobile (customer record, else the latest challan); none → WhatsApp asks which chat. */
  phone: string | null;
  /** The APPLIED range ('' = open-ended). */
  from: string;
  to: string;
  challanList: ReactNode;
  onPdf: (html: string) => void;
  /** Changes when the parent reloads the customer's challans (after an edit / payment) — the statement reloads too. */
  refreshOn?: unknown;
}) {
  const [st, setSt] = useState<Statement | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('days');
  const [reload, setReload] = useState(0);
  // The customer record's phone wins (reminders save it there); best-effort —
  // without it the link still opens WhatsApp and asks which chat.
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  useEffect(() => {
    setSavedPhone(null);
    if (!customerId) return;
    let alive = true;
    supabase.from('cash_challan_customers').select('phone').eq('id', customerId).maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      if (error) { logSwallowed('statement customer phone', error); return; }
      setSavedPhone((data as { phone: string | null } | null)?.phone ?? null);
    });
    return () => { alive = false; };
  }, [customerId]);

  useEffect(() => {
    let alive = true;
    setErr('');
    loadStatement(customerId, customerName, from, to).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setErr(friendlyError(error)); return; }
      setSt(data ?? null);
    });
    return () => { alive = false; };
  }, [customerId, customerName, from, to, reload, refreshOn]);

  if (err) return (
    <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span>Could not load the statement — {err}</span>
      <button type="button" onClick={() => setReload(n => n + 1)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>Retry</button>
    </div>
  );
  if (!st) return <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Loading statement…</div>;

  const due = st.closing > 0.009;
  const big = st.closing < 0 ? -st.closing : st.closing;
  const line = (label: string, value: string, color?: string, strong?: boolean) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: strong ? 700 : 400 }}>
      <span style={{ color: strong ? T.tx : T.tx2 }}>{label}</span>
      <span style={{ fontFamily: T.mono, color: color ?? T.tx }}>{value}</span>
    </div>
  );
  const tabBtn = (k: Tab, label: string) => (
    <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
      style={{ minHeight: 44, border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, fontFamily: T.sans, cursor: 'pointer', background: tab === k ? T.s3 : 'transparent', color: tab === k ? T.tx : T.tx3 }}>{label}</button>
  );
  const openTotal = st.open.reduce((t, b) => t + b.due, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={S.fLabel}>{closingLabel(st)}</div>
            <div style={{ fontSize: 30, fontWeight: 800, fontFamily: T.mono, color: due ? T.re : T.gr, lineHeight: 1.1 }}>{inr(big)}</div>
            <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>
              {st.open.length ? `${st.open.length} bill${st.open.length === 1 ? '' : 's'} open today` : 'No bill open today'}
              {st.unusedCredit > 0.009 ? ` · ${inr(st.unusedCredit)} return credit not used yet` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* A real anchor: the one way that reliably opens WhatsApp from the installed app (lib/whatsapp.ts). */}
            <a href={waLink(statementWhatsApp(customerName, st), waPhone(savedPhone) ? savedPhone : phone)} target="_blank" rel="noopener noreferrer"
              style={{ ...S.btnPrimary, minHeight: 44, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>Send on WhatsApp</a>
            <button type="button" onClick={() => onPdf(statementPdfHtml(customerName, st))} style={{ ...S.btnGhost, minHeight: 44 }}>Print / share</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `1px solid ${T.bd}`, paddingTop: 10 }}>
          {st.from && line(`Pending on ${dayLabel(st.from)}`, inr(st.opening))}
          {line(`+ Bills (${st.bills.n})`, inr(st.bills.sum))}
          {line(`− Goods returned (${st.returns.n})`, inr(st.returns.sum), T.gr)}
          {line('− Money received', inr(st.received), T.gr)}
          {st.refunds !== 0 && line('+ Refunds paid to customer', inr(st.refunds))}
          <div style={{ height: 1, background: T.bd }} />
          {line(`= ${closingLabel(st)}`, inr(st.closing), due ? T.re : T.gr, true)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 9, padding: 3 }}>
        {tabBtn('days', 'Day by day')}{tabBtn('open', `Open bills (${st.open.length})`)}{tabBtn('all', 'All challans')}
      </div>

      {tab === 'days' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {st.from && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.tx3, padding: '0 4px' }}>
              <span>{dayLabel(st.from)} · pending from before</span><span style={{ fontFamily: T.mono }}>bal {inr(st.opening)}</span>
            </div>
          )}
          {st.rows.map(r => (
            <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8,
              background: r.plus ? 'rgba(255,255,255,0.02)' : T.gr15, border: `1px solid ${r.plus ? T.bd : T.gr22}` }}>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: r.plus ? T.tx : T.gr }}>{r.title}</span>
                <span style={{ fontSize: 11, color: T.tx3, lineHeight: 1.4 }}>{r.date}{r.detail ? ` · ${r.detail}` : ''}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontFamily: T.mono, color: r.plus ? T.tx : T.gr }}>{r.plus ? '+' : '−'} {inr(r.amount)}</span>
                <span style={{ fontSize: 10, fontFamily: T.mono, color: T.tx3 }}>bal {inr(r.balance)}</span>
              </div>
            </div>
          ))}
          {st.rows.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Nothing billed, returned or paid in this period.</div>}
        </div>
      )}

      {tab === 'open' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: T.tx3, padding: '0 4px' }}>What is left on each bill today, after returns and payments.</div>
          {st.open.map(b => (
            <div key={b.no} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}` }}>
              <span style={{ fontSize: 13 }}><span style={{ fontFamily: T.mono, fontWeight: 600 }}>#{b.no}</span> <span style={{ color: T.tx3, fontSize: 11 }}>{b.date}{b.partly ? ' · part paid' : ''}</span></span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: T.re }}>{inr(b.due)}</span>
            </div>
          ))}
          {st.unusedCredit > 0.009 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, background: T.gr15, border: `1px solid ${T.gr22}`, fontSize: 13 }}>
              <span style={{ color: T.gr }}>Return credit not used yet</span><span style={{ fontFamily: T.mono, color: T.gr }}>− {inr(st.unusedCredit)}</span>
            </div>
          )}
          {st.open.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontSize: 13, fontWeight: 700, borderTop: `1px solid ${alpha(T.tx3, 0.3)}` }}>
              <span>Total open today</span><span style={{ fontFamily: T.mono, color: T.re }}>{inr(openTotal - st.unusedCredit)}</span>
            </div>
          )}
          {st.open.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.gr, fontSize: 12 }}>Every bill is paid.</div>}
        </div>
      )}

      {tab === 'all' && challanList}
    </div>
  );
}

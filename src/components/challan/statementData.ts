// Customer statement (bank-passbook view of the Cash Challan ledger, owner's
// ask 2026-10-31): pending at the start + bills − goods returned − money
// received (+ refunds paid out) = to collect. customer_statement() does the
// sums in SQL (a return counts once, on its own date; "Return Credit" rows are
// not money); this file turns its JSON into rows with a running balance and
// the words the screen and the PDF both use.
import { supabase } from '../../lib/supabase';

type RawEvent = { d: string; kind: 'bill' | 'return' | 'received' | 'refund'; no: number | null; amount: number; mode: string | null; refs: Array<number | { no: number; d: string }> };
export type RawStatement = { opening: number; events: RawEvent[]; open_bills: { no: number; d: string; total: number; due: number }[]; unused_credit: number; outstanding: number };

export type StatementRow = { key: string; date: string; kind: RawEvent['kind']; title: string; detail: string; amount: number; plus: boolean; balance: number; no: number | null };
export type Statement = {
  opening: number; closing: number; outstanding: number; unusedCredit: number;
  bills: { n: number; sum: number }; returns: { n: number; sum: number }; received: number; refunds: number;
  rows: StatementRow[]; open: { no: number; date: string; due: number; partly: boolean }[];
  from: string; to: string; current: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
export const inr = (n: number) => '₹' + r2(n).toLocaleString('en-IN');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'YYYY-MM-DD' → '13 Oct' (or '13 Oct 2025' when another year than the period's). */
export const dayLabel = (iso: string, year?: string) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${year && y !== year ? ` ${y}` : ''}`;
};
const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const billList = (nos: number[]) => nos.length <= 8 ? nos.map(n => `#${n}`).join(', ') : `${nos.slice(0, 8).map(n => `#${n}`).join(', ')} +${nos.length - 8} more`;

export async function loadStatement(customerId: string | null, customerName: string, from: string, to: string): Promise<{ data?: Statement; error?: unknown }> {
  const { data, error } = await supabase.rpc('customer_statement', { p_customer_id: customerId, p_customer_name: customerName, p_from: from || null, p_to: to || null });
  if (error) return { error };
  return { data: buildStatement(data as RawStatement, from, to) };
}

/** customer_statement() JSON → rows with a running balance and their words. */
export function buildStatement(s: RawStatement, from: string, to: string): Statement {
  const year = (to || istToday()).slice(0, 4);
  let bal = Number(s.opening) || 0;
  const rows = s.events.map((e, i): StatementRow => {
    const amt = Number(e.amount);
    const plus = e.kind === 'bill' || e.kind === 'refund';
    bal = r2(bal + (plus ? amt : -amt));
    let title = '', detail = '';
    if (e.kind === 'bill') title = `Bill #${e.no}`;
    else if (e.kind === 'return') {
      title = `Goods returned · #${e.no}`;
      const refs = e.refs as { no: number; d: string }[];
      const older = refs.filter(r => from && r.d < from);
      detail = refs.length === 0 ? 'Credit not used on a bill yet'
        : older.length === refs.length ? `Cleared older bill ${refs.map(r => `#${r.no} (${dayLabel(r.d, year)})`).join(', ')}`
        : `Taken off bill ${refs.map(r => (from && r.d < from ? `#${r.no} (${dayLabel(r.d, year)})` : `#${r.no}`)).join(', ')}`;
    } else if (e.kind === 'received') {
      title = `${e.mode || 'Payment'} received`;
      detail = (e.refs as number[]).length ? `For ${billList(e.refs as number[])}` : '';
    } else {
      title = `Refund paid · ${e.mode || ''}`.trim();
      detail = (e.refs as number[]).length ? `On return ${billList(e.refs as number[])}` : '';
    }
    return { key: `${i}`, date: dayLabel(e.d, year), kind: e.kind, title, detail, amount: amt, plus, balance: bal, no: e.no };
  });
  const sum = (k: RawEvent['kind']) => r2(s.events.filter(e => e.kind === k).reduce((t, e) => t + Number(e.amount), 0));
  const count = (k: RawEvent['kind']) => s.events.filter(e => e.kind === k).length;
  return {
    opening: Number(s.opening) || 0, closing: bal, outstanding: Number(s.outstanding) || 0, unusedCredit: Number(s.unused_credit) || 0,
    bills: { n: count('bill'), sum: sum('bill') }, returns: { n: count('return'), sum: sum('return') },
    received: sum('received'), refunds: sum('refund'), rows,
    open: s.open_bills.map(b => ({ no: b.no, date: dayLabel(b.d, year), due: Number(b.due), partly: Number(b.due) < Number(b.total) })),
    from, to, current: !to || to >= istToday(),
  };
}

/** "To collect" for a period that reaches today; otherwise the balance on its last day. */
export const closingLabel = (s: Statement) => s.current ? (s.closing < 0 ? 'Customer has credit' : 'To collect') : `Balance on ${dayLabel(s.to)}`;

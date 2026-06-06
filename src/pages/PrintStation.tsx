import { useState, useEffect, useCallback, useRef } from 'react';
import { T, S } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { connect, isConnected, getSlotPrinter, printHtml, SLOT_LABELS } from '../lib/qzPrint';
import type { PrintJob, PrintSlot } from '../types/database';
import type { PageSize } from '../lib/qzPrint';

const SLOTS: PrintSlot[] = ['label_small', 'label_large', 'document'];
const STALE_MS = 120_000;

export default function PrintStation() {
  const [connected, setConnected] = useState(false);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [stationName] = useState(() => {
    const stored = localStorage.getItem('print_station_name');
    if (stored) return stored;
    const name = `Station-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('print_station_name', name);
    return name;
  });
  const [processing, setProcessing] = useState<string | null>(null);
  const [stats, setStats] = useState({ printed: 0, failed: 0 });
  const processingRef = useRef(false);

  const mySlots = SLOTS.filter(s => getSlotPrinter(s));

  const tryConnect = useCallback(async () => {
    try {
      await connect();
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    tryConnect();
    // Only re-attempt if the socket actually dropped — calling QZ repeatedly
    // when already connected re-triggers the trust prompt on every poll.
    const iv = setInterval(() => {
      if (isConnected()) setConnected(true);
      else tryConnect();
    }, 15_000);
    return () => clearInterval(iv);
  }, [tryConnect]);

  const fetchJobs = useCallback(async () => {
    const { data } = await supabase.from('print_queue')
      .select('id, printer_slot, html, page_size, copies, title, status, error_message, created_at, printed_at, printed_by_station')
      .order('created_at', { ascending: false }).limit(50);
    if (data) setJobs(data as PrintJob[]);
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  useEffect(() => {
    const chan = supabase.channel('print-queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_queue' }, () => { fetchJobs(); })
      .subscribe();
    const poll = setInterval(fetchJobs, 5000);
    return () => { clearInterval(poll); supabase.removeChannel(chan); };
  }, [fetchJobs]);

  const processJob = useCallback(async (job: PrintJob) => {
    if (processingRef.current) return;
    const printer = getSlotPrinter(job.printer_slot);
    if (!printer || !isConnected()) return;

    processingRef.current = true;
    setProcessing(job.id);

    const { data: claimed, error: claimErr } = await supabase.from('print_queue')
      .update({ status: 'printing', printed_by_station: stationName, printed_at: new Date().toISOString() })
      .eq('id', job.id).eq('status', 'pending')
      .select('id').maybeSingle();
    if (claimErr || !claimed) { processingRef.current = false; setProcessing(null); return; }

    try {
      const ps: PageSize = job.page_size === 'A4' ? 'A4' : typeof job.page_size === 'object' && job.page_size
        ? { width: Number((job.page_size as Record<string, number>).width || (job.page_size as Record<string, number>).w),
            height: Number((job.page_size as Record<string, number>).height || (job.page_size as Record<string, number>).h) }
        : 'A4';
      await printHtml(printer, job.html, ps, job.copies);
      await supabase.from('print_queue').update({ status: 'done', printed_at: new Date().toISOString() }).eq('id', job.id).eq('status', 'printing');
      setStats(s => ({ ...s, printed: s.printed + 1 }));
    } catch (e: any) {
      await supabase.from('print_queue').update({ status: 'failed', error_message: e?.message || 'Unknown error' }).eq('id', job.id);
      setStats(s => ({ ...s, failed: s.failed + 1 }));
    }

    processingRef.current = false;
    setProcessing(null);
  }, [stationName]);

  useEffect(() => {
    if (processingRef.current || !connected) return;
    const pending = jobs.find(j => j.status === 'pending' && mySlots.includes(j.printer_slot));
    if (pending) processJob(pending);
  }, [jobs, connected, processJob, mySlots]);

  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      jobs.filter(j => j.status === 'printing').forEach(j => {
        const claimedAt = j.printed_at ? new Date(j.printed_at).getTime() : new Date(j.created_at).getTime();
        if (now - claimedAt > STALE_MS) {
          supabase.from('print_queue').update({ status: 'failed', error_message: 'Print timed out — station may have crashed', printed_by_station: null }).eq('id', j.id).eq('status', 'printing');
        }
      });
    }, 30_000);
    return () => clearInterval(iv);
  }, [jobs]);

  const cancelJob = async (id: string) => {
    const { error } = await supabase.from('print_queue').delete().eq('id', id);
    if (!error) setJobs(j => j.filter(x => x.id !== id));
  };

  const retryJob = async (id: string) => {
    await supabase.from('print_queue').update({ status: 'pending', error_message: null, printed_at: null, printed_by_station: null }).eq('id', id);
  };

  const statusColor = (s: string) => s === 'done' ? T.gr : s === 'failed' ? T.re : s === 'printing' ? T.bl : T.yl;

  return (
    <div className="page-pad" style={{ padding: '14px 16px', fontFamily: T.sans, color: T.tx, minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: T.sora }}>Print Station</div>
          <div style={{ fontSize: 11, color: T.tx3 }}>{stationName} — {mySlots.length} slot{mySlots.length !== 1 ? 's' : ''} assigned</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: connected ? T.gr : T.re }} />
          <span style={{ fontSize: 12, color: connected ? T.gr : T.re, fontWeight: 600 }}>{connected ? 'QZ Tray Connected' : 'QZ Tray Offline'}</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.tx, fontFamily: T.mono }}>{jobs.filter(j => j.status === 'pending').length}</div>
          <div style={{ fontSize: 10, color: T.yl, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Pending</div>
        </div>
        <div style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.gr, fontFamily: T.mono }}>{stats.printed}</div>
          <div style={{ fontSize: 10, color: T.gr, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Printed</div>
        </div>
        <div style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.re, fontFamily: T.mono }}>{stats.failed}</div>
          <div style={{ fontSize: 10, color: T.re, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Failed</div>
        </div>
      </div>

      {/* Assigned Printers */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...S.fLabel, marginBottom: 8 }}>Assigned Printers</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SLOTS.map(slot => {
            const printer = getSlotPrinter(slot);
            return (
              <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 6, fontSize: 12 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: printer ? T.gr : T.tx3 }} />
                <span style={{ color: T.tx2, flex: 1 }}>{SLOT_LABELS[slot]}</span>
                <span style={{ color: printer ? T.tx : T.tx3, fontWeight: 600, fontFamily: T.mono, fontSize: 11 }}>{printer || 'Not assigned'}</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 6 }}>Configure printers in Settings → Printer Configuration</div>
      </div>

      {!connected && (
        <div style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.15)', borderRadius: 8, padding: '14px 16px', marginBottom: 16, fontSize: 12, color: T.re, lineHeight: 1.5 }}>
          <strong>QZ Tray is not running.</strong> Install QZ Tray on this computer and start it. Print jobs will queue and be processed once connected.
        </div>
      )}

      {/* Job Queue */}
      <div style={{ ...S.fLabel, marginBottom: 8 }}>Print Queue</div>
      <div style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden' }}>
        {jobs.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No print jobs yet. Jobs appear here when someone prints from any device.</div>
        )}
        {jobs.map(j => (
          <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, opacity: processing === j.id ? 0.6 : 1 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(j.status), flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title || j.printer_slot}</div>
              <div style={{ fontSize: 10, color: T.tx3 }}>
                {SLOT_LABELS[j.printer_slot as PrintSlot] || j.printer_slot} · {new Date(j.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                {j.printed_by_station && ` · ${j.printed_by_station}`}
              </div>
              {j.error_message && <div style={{ fontSize: 10, color: T.re, marginTop: 2 }}>{j.error_message}</div>}
            </div>
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${statusColor(j.status)}22`, color: statusColor(j.status), fontWeight: 700, textTransform: 'uppercase' }}>{j.status}</span>
            {(j.status === 'pending' || j.status === 'failed') && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {j.status === 'failed' && <button onClick={() => retryJob(j.id)} style={{ ...S.btnGhost, ...S.btnSm }}>Retry</button>}
                <button onClick={() => cancelJob(j.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

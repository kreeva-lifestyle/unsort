import { useState, useEffect, useCallback, useRef } from 'react';
import { T, S } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { connect, isConnected, getSlotPrinter, printHtml, SLOT_LABELS, friendlyPrintError } from '../lib/qzPrint';
import ConfirmModal, { useConfirm } from '../components/ui/ConfirmModal';
import type { PrintJob, PrintSlot } from '../types/database';
import type { PageSize } from '../lib/qzPrint';

const SLOTS: PrintSlot[] = ['label_small', 'label_large', 'document'];
const STALE_MS = 120_000;
const PRINT_TIMEOUT_MS = 60_000;
// A pending job nobody printed for this long is stale business-wise — printing
// a challan hours after it was requested surprises everyone. Expire instead.
const MAX_PENDING_AGE_MS = 30 * 60_000;
const HEARTBEAT_MS = 45_000;

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
  const { ask, modalProps } = useConfirm();

  const mySlots = SLOTS.filter(s => getSlotPrinter(s));
  const activeCount = jobs.filter(j => j.status === 'pending' || j.status === 'printing').length;

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

  // On (re)mount, recover this station's own jobs left mid-print by a previous
  // tab close/refresh. Only reset ones claimed >90s ago — a sibling tab's print
  // can legitimately run up to PRINT_TIMEOUT_MS, so a shorter window would
  // clobber it and double-print.
  useEffect(() => {
    const cutoff = new Date(Date.now() - 90_000).toISOString();
    supabase.from('print_queue')
      .update({ status: 'pending', printed_by_station: null, printed_at: null })
      .eq('status', 'printing').eq('printed_by_station', stationName).lt('printed_at', cutoff)
      .then(({ error }) => { if (error) console.warn('Recovery update failed:', error); fetchJobs(); });
    // Housekeeping: print logs are kept for 7 days only (owner policy) —
    // anything finished (done OR failed) older than that is purged.
    const logCutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
    supabase.from('print_queue').delete().in('status', ['done', 'failed']).lt('created_at', logCutoff)
      .then(({ error }) => { if (error) console.warn('Print-log cleanup failed:', error); });
  }, [stationName, fetchJobs]);

  useEffect(() => {
    const chan = supabase.channel('print-queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_queue' }, () => { fetchJobs(); })
      .subscribe();
    const poll = setInterval(fetchJobs, 5000);
    // Background tabs get throttled timers and may drop the websocket during
    // sleep — catch up the moment the tab is visible again.
    const onVisible = () => { if (document.visibilityState === 'visible') { fetchJobs(); tryConnect(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(poll); supabase.removeChannel(chan); document.removeEventListener('visibilitychange', onVisible); };
  }, [fetchJobs, tryConnect]);

  const processJob = useCallback(async (job: PrintJob) => {
    if (processingRef.current) return;
    const printer = getSlotPrinter(job.printer_slot);
    if (!printer || !isConnected()) return;

    processingRef.current = true;
    setProcessing(job.id);

    // Expire jobs that sat unprinted too long (station was off) — printing a
    // challan hours after it was requested causes more harm than skipping it.
    if (Date.now() - new Date(job.created_at).getTime() > MAX_PENDING_AGE_MS) {
      const { error: expireErr } = await supabase.from('print_queue')
        .update({ status: 'failed', error_message: 'Expired — queued too long without a print station. Print again if still needed.' })
        .eq('id', job.id).eq('status', 'pending');
      if (expireErr) console.warn('Expire update failed:', expireErr);
      processingRef.current = false;
      setProcessing(null);
      return;
    }

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
      // Bound the print so one unresponsive printer can't freeze the whole queue.
      await Promise.race([
        printHtml(printer, job.html, ps, job.copies),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Print timed out')), PRINT_TIMEOUT_MS)),
      ]);
      await supabase.from('print_queue').update({ status: 'done', printed_at: new Date().toISOString() }).eq('id', job.id).eq('status', 'printing');
      setStats(s => ({ ...s, printed: s.printed + 1 }));
    } catch (e: any) {
      await supabase.from('print_queue').update({ status: 'failed', error_message: friendlyPrintError(e?.message) }).eq('id', job.id);
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

  // Heartbeat — lets every other device know a working station is alive, so
  // printOrQueue can warn immediately when nobody is around to print.
  useEffect(() => {
    if (!connected) return;
    const beat = () => {
      supabase.from('app_settings')
        .upsert({ key: 'print_station_heartbeat', value: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'key' })
        .then(({ error }) => { if (error) console.warn('Heartbeat failed:', error); });
    };
    beat();
    const iv = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(iv);
  }, [connected]);

  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      jobs.filter(j => j.status === 'printing').forEach(j => {
        const claimedAt = j.printed_at ? new Date(j.printed_at).getTime() : new Date(j.created_at).getTime();
        if (now - claimedAt > STALE_MS) {
          // .then() is required — supabase-js queries are lazy and never
          // execute without it (this sweep was silently a no-op before).
          supabase.from('print_queue').update({ status: 'failed', error_message: friendlyPrintError('Print timed out — station may have crashed'), printed_by_station: null }).eq('id', j.id).eq('status', 'printing')
            .then(({ error }) => { if (error) console.warn('Stale job reset failed:', error); });
        }
      });
    }, 30_000);
    return () => clearInterval(iv);
  }, [jobs]);

  const cancelJob = async (id: string) => {
    const { error } = await supabase.from('print_queue').delete().eq('id', id);
    if (!error) setJobs(j => j.filter(x => x.id !== id));
    else { console.warn('Cancel failed:', error); fetchJobs(); }
  };

  // Emergency stop — purge every queued/in-progress job so nothing more prints.
  const stopAll = async () => {
    if (activeCount === 0) return;
    const ok = await ask({
      title: 'Stop all printing?',
      message: `This cancels ${activeCount} queued job${activeCount !== 1 ? 's' : ''} so nothing more prints. Pages already sent to a printer can't be pulled back.`,
      confirmLabel: 'Stop All',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('print_queue').delete().in('status', ['pending', 'printing']);
    if (!error) setJobs(j => j.filter(x => x.status !== 'pending' && x.status !== 'printing'));
  };

  const retryJob = async (id: string) => {
    const { error } = await supabase.from('print_queue').update({ status: 'pending', error_message: null, printed_at: null, printed_by_station: null }).eq('id', id);
    if (error) console.warn('Retry failed:', error);
    fetchJobs();
  };

  const statusColor = (s: string) => s === 'done' ? T.gr : s === 'failed' ? T.re : s === 'printing' ? T.bl : T.yl;

  return (
    <div className="page-pad" style={{ padding: '14px 16px', fontFamily: T.sans, color: T.tx }}>
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
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
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
          <strong>QZ Tray is not running.</strong> Install QZ Tray on this computer and start it. Print jobs will queue and be processed once connected.{' '}
          <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer" style={{ color: T.ac2, fontWeight: 600 }}>Download QZ Tray ↗</a>
        </div>
      )}

      {/* Job Queue */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={S.fLabel}>Print Queue</span>
        {activeCount > 0 && (
          <button onClick={stopAll} style={{ ...S.btnDangerSolid, ...S.btnSm }}>
            ■ Stop All ({activeCount})
          </button>
        )}
      </div>
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
      <ConfirmModal {...modalProps} />
    </div>
  );
}

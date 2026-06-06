import { useState, useEffect, useCallback } from 'react';
import { T, S } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { connect, listPrinters, getSlotPrinter, setSlotPrinter, SLOT_LABELS, printHtml, friendlyPrintError } from '../../lib/qzPrint';
import { getPrintMode, setPrintMode } from '../../lib/printQueue';
import type { PrintSlot, PrintJob } from '../../types/database';

const SLOTS: PrintSlot[] = ['label_small', 'label_large', 'document'];

export default function PrinterSettings({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const [mode, setMode] = useState(getPrintMode);
  const [connected, setConnected] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<Record<PrintSlot, string | null>>({
    label_small: getSlotPrinter('label_small'),
    label_large: getSlotPrinter('label_large'),
    document: getSlotPrinter('document'),
  });
  const [recentJobs, setRecentJobs] = useState<PrintJob[]>([]);

  const refreshPrinters = useCallback(async () => {
    setLoading(true);
    try {
      await connect();
      const list = await listPrinters();
      setPrinters(list);
      setConnected(true);
    } catch {
      setConnected(false);
      setPrinters([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mode === 'cloud') refreshPrinters();
  }, [mode, refreshPrinters]);

  useEffect(() => {
    if (mode !== 'cloud') return;
    supabase.from('print_queue').select('id, printer_slot, title, status, error_message, created_at, printed_at')
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setRecentJobs(data as PrintJob[]); });
  }, [mode]);

  const handleModeChange = async (m: 'cloud' | 'default') => {
    setMode(m);
    const { error } = await setPrintMode(m);
    if (error) addToast(friendlyError(error), 'error');
    else addToast(`Print mode set to ${m === 'cloud' ? 'Cloud Print' : 'Default Browser'} for everyone`, 'success');
  };

  const handleSlotChange = (slot: PrintSlot, printer: string) => {
    const val = printer || null;
    setSlotPrinter(slot, val);
    setSlots(p => ({ ...p, [slot]: val }));
  };

  const testPrint = async (slot: PrintSlot) => {
    const printer = slots[slot];
    if (!printer) { addToast('Select a printer first', 'error'); return; }
    try {
      await printHtml(printer, `<html><body style="font-family:Arial;text-align:center;padding:20px"><h2>Test Print</h2><p>Slot: ${SLOT_LABELS[slot]}</p><p>Printer: ${printer}</p><p>${new Date().toLocaleString()}</p></body></html>`, slot === 'document' ? 'A4' : slot === 'label_large' ? { width: 4, height: 6 } : { width: 1.97, height: 2.97 });
      addToast('Test page sent to printer', 'success');
    } catch (e: any) {
      addToast(friendlyPrintError(e?.message), 'error');
    }
  };

  const cancelJob = async (id: string) => {
    const { error } = await supabase.from('print_queue').delete().eq('id', id);
    if (error) addToast(friendlyError(error), 'error');
    else { setRecentJobs(j => j.filter(x => x.id !== id)); addToast('Job cancelled', 'success'); }
  };

  const retryJob = async (id: string) => {
    const { error } = await supabase.from('print_queue').update({ status: 'pending', error_message: null, printed_at: null, printed_by_station: null }).eq('id', id);
    if (error) addToast(friendlyError(error), 'error');
    else { setRecentJobs(j => j.map(x => x.id === id ? { ...x, status: 'pending' as const, error_message: null } : x)); addToast('Job requeued', 'success'); }
  };

  const statusDot = (s: string) => {
    const c = s === 'done' ? T.gr : s === 'failed' ? T.re : s === 'printing' ? T.bl : T.yl;
    return <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: c, marginRight: 6 }} />;
  };

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 14 }}>Printer Configuration</div>

      {/* Mode Toggle */}
      <div style={{ marginBottom: 16 }}>
        <label style={S.fLabel}>Print Mode</label>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {(['default', 'cloud'] as const).map(m => (
            <button key={m} onClick={() => handleModeChange(m)} style={{ ...S.btnGhost, ...(mode === m ? { background: `linear-gradient(135deg, ${T.ac87}, ${T.ac2cc})`, color: '#fff', borderColor: 'transparent' } : {}) }}>
              {m === 'default' ? 'Default (Browser)' : 'Cloud Print (QZ Tray)'}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 6 }}>
          {mode === 'default' ? 'Uses the browser\'s native print dialog. Works without any setup.' : 'Sends jobs to a Print Station running QZ Tray. Works from any device over the internet.'}
        </div>
      </div>

      {mode === 'cloud' && (
        <>
          {/* Connection Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? T.gr : T.re }} />
            <span style={{ fontSize: 12, color: connected ? T.gr : T.re, fontWeight: 600 }}>
              {connected ? 'QZ Tray Connected' : 'QZ Tray Not Running'}
            </span>
            <button onClick={refreshPrinters} disabled={loading} style={{ ...S.btnGhost, ...S.btnSm, marginLeft: 'auto', opacity: loading ? 0.5 : 1 }}>
              {loading ? 'Scanning…' : 'Refresh Printers'}
            </button>
          </div>

          {/* Printer Slots */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {SLOTS.map(slot => (
              <div key={slot} style={{ padding: '12px 14px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8 }}>
                <label style={{ ...S.fLabel, marginBottom: 6, display: 'block' }}>{SLOT_LABELS[slot]}</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select value={slots[slot] || ''} onChange={e => handleSlotChange(slot, e.target.value)} style={{ ...S.fInput, flex: 1, cursor: 'pointer' }}>
                    <option value="">None (not assigned)</option>
                    {printers.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button onClick={() => testPrint(slot)} disabled={!slots[slot]} style={{ ...S.btnGhost, ...S.btnSm, opacity: slots[slot] ? 1 : 0.3 }}>Test</button>
                </div>
              </div>
            ))}
          </div>

          {/* Recent Jobs */}
          {recentJobs.length > 0 && (
            <div>
              <label style={{ ...S.fLabel, marginBottom: 8, display: 'block' }}>Recent Print Jobs</label>
              <div style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
                {recentJobs.map(j => (
                  <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, fontSize: 11 }}>
                    {statusDot(j.status)}
                    <span style={{ color: T.tx, fontWeight: 600, flex: 1 }}>{j.title || j.printer_slot}</span>
                    <span style={{ color: T.tx3, fontSize: 10 }}>{j.status}</span>
                    {j.error_message && <span style={{ color: T.re, fontSize: 10 }}>{j.error_message}</span>}
                    {(j.status === 'pending' || j.status === 'failed') && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {j.status === 'failed' && <button onClick={() => retryJob(j.id)} style={{ ...S.btnGhost, ...S.btnSm, fontSize: 9, padding: '2px 6px' }}>Retry</button>}
                        <button onClick={() => cancelJob(j.id)} style={{ ...S.btnDanger, ...S.btnSm, fontSize: 9, padding: '2px 6px' }}>Cancel</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

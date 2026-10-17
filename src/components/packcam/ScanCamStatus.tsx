// PackStation scanning: is this camera's packing video being saved? One line
// under the session strip, from the office PC's heartbeat (app_settings
// packcam / packcam_agent), plus a "video saved" mark per recent scan from
// packcam_clips. Refreshed every 15 s while the scan screen is open (and on
// return to the browser tab); hidden when Pack Cam recording is off.
import { useEffect, useRef, useState } from 'react';
import { T, alpha } from '../../lib/theme';
import { logSwallowed } from '../../lib/errorLogger';
import { supabase } from '../../lib/supabase';
import { agentOnline, loadSettings, playable } from '../settings/packcam/packcamApi';
import type { PackcamClip } from '../../types/packcam';

export type ClipMark = 'saved' | 'waiting' | 'none';
export interface CamLive { tone: 'ok' | 'warn' | 'bad'; text: string }
type ClipRow = Pick<PackcamClip, 'awb' | 'status' | 'pc_path' | 'dropbox_path' | 'gdrive_link'>;

const POLL_MS = 15_000;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/**
 * While `active`: camera `camera`'s recording state, and a mark per AWB
 * scanned this session. One poll every 15 s drives everything; new scans are
 * picked up on the next one (their clip is only cut after the next scan).
 */
export function usePackcamLive(active: boolean, camera: string, awbs: string[]) {
  const [live, setLive] = useState<CamLive | null>(null);
  const [marks, setMarks] = useState<Record<string, ClipMark>>({});
  const awbRef = useRef<string[]>([]);
  awbRef.current = awbs.slice(0, 30);
  useEffect(() => {
    if (!active) { setLive(null); setMarks({}); return; }
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { settings, agent } = await loadSettings();
        if (!alive) return;
        if (!settings.enabled) { setLive(null); setMarks({}); return; }
        const cam = (agent.cameras || []).find(c => String(c.number) === camera);
        setLive(!agent.last_seen ? { tone: 'bad', text: 'Video PC not connected — no packing videos are being saved' }
          : !agentOnline(agent) ? { tone: 'bad', text: `Video PC offline since ${timeOf(agent.last_seen)} — packing videos are not being saved` }
          : !cam ? { tone: 'warn', text: `Camera ${camera} is not set up in Pack Cam — no videos for these scans` }
          : !cam.ok ? { tone: 'bad', text: `Camera ${camera} not recording${cam.error ? `: ${cam.error}` : ''} — videos are not being saved` }
          : { tone: 'ok', text: `Camera ${camera} recording · packing videos are being saved` });
        const list = awbRef.current;
        if (!list.length) { setMarks({}); return; }
        // Last 24 h rather than "since the session started": scanned_at is
        // server time and this device's clock may be off.
        const { data, error } = await supabase.from('packcam_clips').select('awb, status, pc_path, dropbox_path, gdrive_link')
          .eq('camera', camera).gte('scanned_at', new Date(Date.now() - 86_400_000).toISOString()).in('awb', list).order('scanned_at');
        if (error) throw error;
        if (!alive) return;
        // Oldest first, so an AWB scanned again (after an undo) shows its newest clip.
        const m: Record<string, ClipMark> = {};
        for (const r of (data || []) as ClipRow[]) m[r.awb] = playable(r) ? 'saved' : r.status === 'missing' || r.status === 'failed' ? 'none' : 'waiting';
        setMarks(m);
      } catch (e) { logSwallowed('packcam scan status', e); }
    };
    load();
    const t = setInterval(load, POLL_MS);
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [active, camera]);
  /** No clip row yet while the camera records: the PC picks the scan up and cuts it after the next scan. */
  const markOf = (awb: string): ClipMark | undefined => marks[awb] ?? (live?.tone === 'ok' ? 'waiting' : undefined);
  return { live, markOf };
}

const TONE = { ok: T.gr, warn: T.yl, bad: T.re } as const;

export function CamStatusLine({ live }: { live: CamLive | null }) {
  if (!live) return null;
  const c = TONE[live.tone];
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 12px', borderRadius: 10, border: `1px solid ${live.tone === 'ok' ? T.bd : c}`, background: live.tone === 'ok' ? 'rgba(255,255,255,0.02)' : live.tone === 'warn' ? T.yl22 : alpha(T.re, 0.08), fontSize: 11, color: live.tone === 'ok' ? T.tx2 : c, fontWeight: live.tone === 'ok' ? 500 : 600, lineHeight: 1.4 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, animation: live.tone === 'ok' ? 'subtlePulse 2s ease-in-out infinite' : undefined }} />
      <span>{live.text}</span>
    </div>
  );
}

export function ClipMarkTag({ mark }: { mark?: ClipMark }) {
  if (!mark) return null;
  const [color, text] = mark === 'saved' ? [T.gr, '· video saved'] : mark === 'none' ? [T.re, '· no video'] : [T.tx3, '· video pending'];
  return <span style={{ color, fontWeight: 600, marginLeft: 6 }}>{text}</span>;
}

// PackStation scanning: is this camera's packing video being saved? One line
// under the session strip, from the office PC's heartbeat (app_settings
// packcam / packcam_agent), plus a "video saved" mark per recent scan from
// packcam_clips. Refreshed every 15 s while the scan screen is open (and on
// return to the browser tab, or to the internet). Says plainly when Pack Cam
// is switched off (so a switch-off by mistake is seen on the floor), when
// this phone or the PC has no internet, when a place videos are saved is
// (almost) full or its uploads are failing; and, while recording, reminds
// the packer to scan before packing.
import { useEffect, useRef, useState } from 'react';
import { T, alpha } from '../../lib/theme';
import { logSwallowed } from '../../lib/errorLogger';
import { supabase } from '../../lib/supabase';
import { agentOnline, loadSettings, playable } from '../settings/packcam/packcamApi';
import type { PackcamClip } from '../../types/packcam';
import PackCountdown from './PackCountdown';
import { offSince, storageAlerts, uploadProblems } from './packcamHealth';

export type ClipMark = 'saved' | 'waiting' | 'none';
// packSeconds: from a scan until that parcel's video stops (limit minus pre-roll);
// set whenever the camera records (also while storage is running low).
// canExtend: the office PC (agent 1.4.0+) honours "+30 s".
export interface CamLive { tone: 'ok' | 'warn' | 'bad'; text: string; packSeconds?: number; off?: boolean; canExtend?: boolean }
type ClipRow = Pick<PackcamClip, 'awb' | 'status' | 'pc_path' | 'dropbox_path' | 'gdrive_link'>;

const POLL_MS = 15_000;

/**
 * Seconds from a scan until that parcel's video stops when no next scan
 * comes. Agent 1.2.0+: the limit covers the whole video, pre-roll included
 * (and is never under pre-roll + 10 s); older agents count it from the scan.
 */
const atLeast = (version: string | undefined, maj: number, min: number) => { const [a, b] = String(version || '0').split('.').map(Number); return a > maj || (a === maj && b >= min); };
function packSecondsFor(s: { max_clip_seconds: number; pre_roll_seconds: number }, version?: string) {
  const cap = Number(s.max_clip_seconds) || 600; const pre = Number(s.pre_roll_seconds) || 0;
  return atLeast(version, 1, 2) ? Math.max(cap, pre + 10) - pre : cap;
}
// The red banner above already asks to connect to Wi-Fi; this only says the camera state is unknown.
const PHONE_OFFLINE: CamLive = { tone: 'warn', text: 'Camera status unknown — this phone is offline' };
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
  // Last known on/off: with no internet the "off" line stays as it was.
  const offRef = useRef<CamLive | null>(null);
  useEffect(() => {
    if (!active) { setLive(null); setMarks({}); return; }
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!navigator.onLine) { setLive(offRef.current || PHONE_OFFLINE); return; }
      try {
        const { settings, agent } = await loadSettings();
        if (!alive) return;
        if (!settings.enabled) {
          const since = offSince(settings);
          offRef.current = { tone: 'warn', off: true, text: `Pack Cam is switched off${since ? ` ${since}` : ''} — no packing videos are being recorded. If that is a mistake, ask an admin to switch it on in Settings → Pack Cam` };
          setLive(offRef.current); setMarks({}); return;
        }
        offRef.current = null;
        const cam = (agent.cameras || []).find(c => String(c.number) === camera);
        const full = storageAlerts(agent)[0];
        const upload = uploadProblems(agent)[0];
        const packSeconds = packSecondsFor(settings, agent.version);
        const canExtend = atLeast(agent.version, 1, 4);
        setLive(!agent.last_seen ? { tone: 'bad', text: 'Video PC not connected — no packing videos are being saved' }
          : !agentOnline(agent) ? { tone: 'bad', text: `Video PC offline since ${timeOf(agent.last_seen)} — check the office PC is switched on (power cut?) and its internet / Wi-Fi works. Packing videos are not being saved` }
          : !cam ? { tone: 'warn', text: `Camera ${camera} is not set up in Pack Cam — no videos for these scans` }
          : !cam.ok ? { tone: 'bad', text: `Camera ${camera} not recording${cam.error ? `: ${cam.error}` : ''} — videos are not being saved` }
          : full ? { tone: full.level === 'full' ? 'bad' : 'warn', text: `Camera ${camera} recording · ${full.text}`, packSeconds, canExtend }
          : upload ? { tone: 'warn', text: `Camera ${camera} recording · ${upload} — videos are kept on the PC and sent again later`, packSeconds, canExtend }
          : { tone: 'ok', text: `Camera ${camera} recording · packing videos are being saved`, packSeconds, canExtend });
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
        for (const r of (data || []) as ClipRow[]) m[r.awb] = playable(r) ? 'saved' : r.status === 'missing' || r.status === 'failed' || r.status === 'removed' ? 'none' : 'waiting';
        setMarks(m);
      } catch (e) {
        // Never leave an old "recording" line up when the status cannot be read.
        logSwallowed('packcam scan status', e);
        if (alive) setLive(offRef.current || (navigator.onLine ? { tone: 'warn', text: 'Cannot check the video PC right now — check this phone\'s internet' } : PHONE_OFFLINE));
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('online', load); window.addEventListener('offline', load);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onShow); window.removeEventListener('online', load); window.removeEventListener('offline', load); };
  }, [active, camera]);
  /** No clip row yet while the camera records: the PC picks the scan up and cuts it after the next scan. */
  const markOf = (awb: string): ClipMark | undefined => marks[awb] ?? (live?.packSeconds ? 'waiting' : undefined);
  return { live, markOf };
}

const TONE = { ok: T.gr, warn: T.yl, bad: T.re } as const;

/** The status line, and while the camera records, the countdown for the last parcel scanned. */
export function CamStatusLine({ live, last }: { live: CamLive | null; last?: { awb: string; at?: number; id?: string; pending?: boolean } }) {
  // Only the newest scan gets a countdown: after an Undo the one before it
  // is not "being packed" again, so no timer rather than an old one.
  const newest = useRef(0);
  if (last?.at && last.at > newest.current) newest.current = last.at;
  if (!live) return null;
  const c = TONE[live.tone];
  return (<>
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 12px', borderRadius: 10, border: `1px solid ${live.tone === 'ok' ? T.bd : c}`, background: live.tone === 'ok' ? 'rgba(255,255,255,0.02)' : live.tone === 'warn' ? T.yl22 : alpha(T.re, 0.08), fontSize: 11, color: live.tone === 'ok' ? T.tx2 : c, fontWeight: live.tone === 'ok' ? 500 : 600, lineHeight: 1.4 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, animation: live.tone === 'ok' ? 'subtlePulse 2s ease-in-out infinite' : undefined }} />
      <span>{live.text}</span>
    </div>
    {live.packSeconds ? <div style={{ marginTop: 6, fontSize: 11, color: T.tx2, lineHeight: 1.5 }}>
      <b style={{ color: T.tx }}>Scan first, then pack.</b> The video runs from your scan to your next scan — a parcel scanned after packing gets the next parcel's video.
    </div> : null}
    {live.packSeconds && last?.at && last.at === newest.current ? <PackCountdown key={last.at} awb={last.awb} at={last.at} seconds={live.packSeconds} scanId={last.pending ? undefined : last.id} canExtend={!!live.canExtend} /> : null}
  </>);
}

export function ClipMarkTag({ mark }: { mark?: ClipMark }) {
  if (!mark) return null;
  const [color, text] = mark === 'saved' ? [T.gr, '· video saved'] : mark === 'none' ? [T.re, '· no video'] : [T.tx3, '· video pending'];
  return <span style={{ color, fontWeight: 600, marginLeft: 6 }}>{text}</span>;
}

// PackStation scanning: is this camera's packing video being saved? One line
// under the session strip, from the office PC's heartbeat (app_settings
// packcam / packcam_agent), plus a "video saved" mark per recent scan from
// packcam_clips. Refreshed every 15 s while the scan screen is open; hidden
// when Pack Cam recording is off.
import { useEffect, useState } from 'react';
import { T } from '../../lib/theme';
import { logSwallowed } from '../../lib/errorLogger';
import { supabase } from '../../lib/supabase';
import { agentOnline, loadSettings } from '../settings/packcam/packcamApi';

export type ClipMark = 'saved' | 'waiting' | 'none';
export interface CamLive { tone: 'ok' | 'warn' | 'bad'; text: string }

const POLL_MS = 15_000;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/** While `active`: camera `camera`'s recording state, and a mark per AWB scanned this session (since `since`, ms). */
export function usePackcamLive(active: boolean, camera: string, awbs: string[], since: number) {
  const [live, setLive] = useState<CamLive | null>(null);
  const [marks, setMarks] = useState<Record<string, ClipMark>>({});
  const key = awbs.slice(0, 30).join(',');
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
        const next: CamLive = !agent.last_seen ? { tone: 'bad', text: 'Video PC not connected — no packing videos are being saved' }
          : !agentOnline(agent) ? { tone: 'bad', text: `Video PC offline since ${timeOf(agent.last_seen)} — packing videos are not being saved` }
          : !cam ? { tone: 'warn', text: `Camera ${camera} is not set up in Pack Cam — no videos for these scans` }
          : !cam.ok ? { tone: 'bad', text: `Camera ${camera} not recording${cam.error ? `: ${cam.error}` : ''} — videos are not being saved` }
          : { tone: 'ok', text: `Camera ${camera} recording · packing videos are being saved` };
        setLive(next);
        if (!key) { setMarks({}); return; }
        const { data, error } = await supabase.from('packcam_clips').select('awb, status')
          .eq('camera', camera).gte('scanned_at', new Date(since - 60_000).toISOString()).in('awb', key.split(','));
        if (error) throw error;
        if (!alive) return;
        const rows = (data || []) as { awb: string; status: string }[];
        const m: Record<string, ClipMark> = {};
        // No clip row yet: the PC picks a scan up within seconds, and cuts it
        // once the next scan on this camera (or the clip cap) closes it.
        if (next.tone === 'ok') for (const a of key.split(',')) m[a] = 'waiting';
        // The same AWB twice in a session: a saved video wins.
        for (const r of rows) if (m[r.awb] !== 'saved') m[r.awb] = r.status === 'done' ? 'saved' : r.status === 'missing' || r.status === 'failed' ? 'none' : 'waiting';
        setMarks(m);
      } catch (e) { logSwallowed('packcam scan status', e); }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [active, camera, key, since]);
  return { live, marks };
}

const TONE = { ok: T.gr, warn: T.yl, bad: T.re } as const;

export function CamStatusLine({ live }: { live: CamLive | null }) {
  if (!live) return null;
  const c = TONE[live.tone];
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 12px', borderRadius: 10, border: `1px solid ${live.tone === 'ok' ? T.bd : c}`, background: live.tone === 'ok' ? 'rgba(255,255,255,0.02)' : live.tone === 'warn' ? T.yl22 : 'oklch(0.63 0.22 25 / .08)', fontSize: 11, color: live.tone === 'ok' ? T.tx2 : c, fontWeight: live.tone === 'ok' ? 500 : 600, lineHeight: 1.4 }}>
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

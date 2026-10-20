// Pack Cam data access: settings + heartbeat (app_settings), clips
// (packcam_clips, read-only), cameras, and the packcam edge function
// (agent key, play links).
import { supabase, SUPABASE_ANON_KEY } from '../../../lib/supabase';
import { PACKCAM_DEFAULTS, type PackcamAgentStatus, type PackcamClip, type PackcamPlay, type PackcamSettings } from '../../../types/packcam';

const FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/packcam';

export const CLIP_COLS = 'id, scan_id, awb, courier, camera, scanned_at, clip_start, clip_end, duration_s, size_bytes, status, pc_path, dropbox_path, gdrive_file_id, gdrive_link, error, created_at, updated_at';

/** Call the packcam function as the signed-in user. Throws with the server's message. */
async function call<R>(body: object): Promise<R> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.error || `Pack Cam server error (${r.status})`);
  return d as R;
}

export const newAgentKey = () => call<{ key: string }>({ action: 'new_agent_key' }).then(d => d.key);
export const playClip = (clipId: string) => call<PackcamPlay>({ action: 'play', clip_id: clipId });

export async function loadSettings(): Promise<{ settings: PackcamSettings; agent: PackcamAgentStatus }> {
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', ['packcam', 'packcam_agent']);
  if (error) throw error;
  const by = new Map((data || []).map(r => [r.key, r.value as Record<string, unknown>]));
  const saved = (by.get('packcam') || {}) as Partial<PackcamSettings>;
  return {
    settings: { ...PACKCAM_DEFAULTS, ...saved, targets: { ...PACKCAM_DEFAULTS.targets, ...(saved.targets || {}) } },
    agent: (by.get('packcam_agent') || {}) as PackcamAgentStatus,
  };
}

async function saveSettings(s: PackcamSettings) {
  const { error } = await supabase.from('app_settings').upsert({ key: 'packcam', value: s, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/**
 * Change some settings and keep the rest as saved right now: the on/off
 * switch, Test connection and the Storage form each own their own fields, so
 * none of them puts back another's older values. Returns what was saved.
 */
export async function patchSettings(patch: Partial<PackcamSettings> | ((now: PackcamSettings) => Partial<PackcamSettings>)): Promise<PackcamSettings> {
  const { settings } = await loadSettings();
  const next = { ...settings, ...(typeof patch === 'function' ? patch(settings) : patch) };
  await saveSettings(next);
  return next;
}

/** Online = checked in within the last 3 minutes (it checks in every few seconds). */
export const agentOnline = (a: PackcamAgentStatus) => !!a.last_seen && Date.now() - Date.parse(a.last_seen) < 180_000;

export interface ClipFilter { from: string; to: string; camera: string; status: string; awb: string }

/** One page of clips (IST dates), newest first, with the exact count. */
export async function fetchClips(f: ClipFilter, page: number, size: number) {
  let q = supabase.from('packcam_clips').select(CLIP_COLS, { count: 'exact' });
  if (f.from) q = q.gte('scanned_at', new Date(`${f.from}T00:00:00+05:30`).toISOString());
  if (f.to) q = q.lt('scanned_at', new Date(new Date(`${f.to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString());
  if (f.camera) q = q.eq('camera', f.camera);
  if (f.status) q = q.eq('status', f.status);
  if (f.awb.trim()) q = q.ilike('awb', `%${f.awb.trim().replace(/[%_]/g, '\\$&')}%`);
  const { data, error, count } = await q.order('scanned_at', { ascending: false }).range(page * size, page * size + size - 1);
  if (error) throw error;
  return { rows: (data || []) as PackcamClip[], total: count || 0 };
}

/** Has a copy that can be played (a clip still uploading may already be on the PC). */
export const playable = (r: Pick<PackcamClip, 'status' | 'pc_path' | 'dropbox_path' | 'gdrive_link'>) =>
  r.status === 'done' || ((r.status === 'uploading' || r.status === 'failed') && !!(r.pc_path || r.dropbox_path || r.gdrive_link));

export const fmtSize = (b: number | null) => (b == null ? '—' : b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);
export const fmtDur = (s: number | null) => { if (s == null) return '—'; const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

export interface CameraConn { id: string; number: string; is_active: boolean | null; ip: string | null; rtsp_port: number; rtsp_path: string; username: string }

export async function loadCameras(): Promise<{ cameras: CameraConn[]; hasPassword: Set<string> }> {
  const [c, p] = await Promise.all([
    supabase.from('packtime_cameras').select('id, number, is_active, ip, rtsp_port, rtsp_path, username').order('number'),
    supabase.rpc('packcam_password_status'),
  ]);
  if (c.error) throw c.error;
  if (p.error) throw p.error;
  return { cameras: (c.data || []) as CameraConn[], hasPassword: new Set(((p.data || []) as { camera_id: string }[]).map(r => r.camera_id)) };
}

/** Save address + (optionally) password in one transaction. password: null keeps it, '' clears it. */
export async function saveCamera(c: CameraConn, password: string | null) {
  const { error } = await supabase.rpc('packcam_save_camera', { p_camera: c.id, p_ip: c.ip || '', p_port: c.rtsp_port, p_path: c.rtsp_path, p_username: c.username, p_password: password });
  if (error) throw error;
}

/** Active cameras with no address that still had scans in the last 24 h: those scans get no video. */
export async function scansWithoutAddress(): Promise<{ number: string; count: number }[]> {
  const { data, error } = await supabase.from('packtime_cameras').select('number, is_active, ip').order('number');
  if (error) throw error;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const missing = ((data || []) as Pick<CameraConn, 'number' | 'is_active' | 'ip'>[]).filter(c => c.is_active !== false && !c.ip);
  const counts = await Promise.all(missing.map(c => supabase.from('packtime_scans').select('id', { count: 'exact', head: true }).eq('camera', c.number).gte('scanned_at', since)));
  const failed = counts.find(r => r.error);
  if (failed?.error) throw failed.error;
  return missing.map((c, i) => ({ number: String(c.number), count: counts[i].count || 0 })).filter(r => r.count > 0);
}

// Why a scan has no packing video, in words: Pack Cam was off, the camera has
// no address, the office PC was offline, the camera was not recording, the
// upload failed… Used by PackStation history and Pack Cam → Videos.
import { supabase } from '../../lib/supabase';
import type { PackcamAgentStatus, PackcamClip, PackcamSettings } from '../../types/packcam';
import { agentOnline, loadSettings, playable } from '../settings/packcam/packcamApi';
import { enabledAt } from './packcamHealth';

export interface NoVideoCtx {
  settings: PackcamSettings;
  agent: PackcamAgentStatus;
  cams: Map<string, { ip: string | null; is_active: boolean | null }>;
  /** The first clip Pack Cam ever made (ms): older scans predate it. */
  firstClipAt: number | null;
}

export async function loadNoVideoCtx(): Promise<NoVideoCtx> {
  const [{ settings, agent }, cams, first] = await Promise.all([
    loadSettings(),
    supabase.from('packtime_cameras').select('number, ip, is_active'),
    supabase.from('packcam_clips').select('scanned_at').order('scanned_at').limit(1),
  ]);
  if (cams.error) throw cams.error;
  if (first.error) throw first.error;
  const rows = (cams.data || []) as { number: string | number; ip: string | null; is_active: boolean | null }[];
  return {
    settings, agent,
    cams: new Map(rows.map(c => [String(c.number), { ip: c.ip, is_active: c.is_active }])),
    firstClipAt: first.data?.[0] ? Date.parse((first.data[0] as { scanned_at: string }).scanned_at) : null,
  };
}

export type ClipLike = Pick<PackcamClip, 'status' | 'error' | 'pc_path' | 'dropbox_path' | 'gdrive_link'>;
/** wait: a video may still come; none: there will be no video. */
export interface NoVideo { tone: 'wait' | 'none'; short: string; text: string }

const timeOf = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** null = a video can be played, or Pack Cam was never in use then (nothing to explain). */
export function noVideoReason(scan: { scanned_at: string | null; received_at?: string | null; camera: string }, clip: ClipLike | undefined, ctx: NoVideoCtx, now = Date.now()): NoVideo | null {
  if (clip && playable(clip)) return null;
  const t = scan.scanned_at ? Date.parse(scan.scanned_at) : NaN;
  // When the server got it: a scan from a phone that was offline arrives
  // later than it was made, and the PC can only pick it up from then on.
  const got = scan.received_at ? Date.parse(scan.received_at) : t;
  const online = agentOnline(ctx.agent);
  const seen = ctx.agent.last_seen ? Date.parse(ctx.agent.last_seen) : null;
  const pcOff = seen ? `The office PC is offline (last seen ${timeOf(seen)}) — check it is switched on and connected to the internet` : 'The office PC has not connected to Pack Cam yet';
  if (clip) {
    if (clip.status === 'removed') return { tone: 'none', short: 'Removed from PC', text: 'The video was moved or deleted from the office PC folder (no Dropbox / Drive copy)' };
    if (clip.status === 'failed') return { tone: 'none', short: 'Save failed', text: `The video could not be saved${clip.error ? `: ${clip.error}` : ''}` };
    if (clip.status === 'missing') {
      if (Number.isFinite(t) && !enabledAt(ctx.settings, t)) return { tone: 'none', short: 'Pack Cam off', text: 'Pack Cam was switched off at this time' };
      return { tone: 'none', short: 'Not recorded', text: `Camera ${scan.camera} was not recording at this time (camera or PC off, or older than the recording kept on the PC)` };
    }
    return online ? { tone: 'wait', short: 'Being made', text: 'The video is being made — it is cut after the next scan on this camera' } : { tone: 'wait', short: 'PC offline', text: `${pcOff}. The video is made once it is back` };
  }
  if (!Number.isFinite(t) || ctx.firstClipAt == null || t < ctx.firstClipAt - 3600_000) return null;
  if (!enabledAt(ctx.settings, t)) return { tone: 'none', short: 'Pack Cam off', text: 'Pack Cam was switched off when this was scanned' };
  const cam = ctx.cams.get(String(scan.camera));
  if (!cam) return { tone: 'none', short: 'Unknown camera', text: `Camera ${scan.camera} is not a PackStation camera, so it is not recorded` };
  if (!cam.ip) return { tone: 'none', short: 'No camera address', text: `Camera ${scan.camera} has no address in Settings → Pack Cam → Cameras, so it is not recorded` };
  if (!cam.is_active) return { tone: 'none', short: 'Camera disabled', text: `Camera ${scan.camera} is disabled in Settings → PackStation, so it is not recorded` };
  if (!online && seen != null && seen < got) {
    // A PC that is on but without internet keeps recording: within the hours
    // of recording it keeps, the video is still made once it is back.
    if (now - t < (Number(ctx.settings.buffer_hours) || 6) * 3600_000) return { tone: 'wait', short: 'PC offline', text: `${pcOff}. If it is on but without internet, the video is made once it is back; if it was off, nothing was recorded` };
    return { tone: 'none', short: 'PC offline', text: `The office PC was offline (last seen ${timeOf(seen)}), so this scan was not recorded` };
  }
  if (online && now - got < 30 * 60_000) return { tone: 'wait', short: 'Being made', text: 'The video is being made — it is cut after the next scan on this camera' };
  return { tone: 'none', short: 'Not picked up', text: 'The office PC did not pick up this scan — it was off or offline at the time' };
}

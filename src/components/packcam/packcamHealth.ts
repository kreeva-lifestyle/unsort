// Pack Cam health in words: is there room left where videos go (from the PC's
// heartbeat — the PC asks Dropbox / Drive itself, nothing extra on our
// server), and was Pack Cam on at a given time (settings.enabled_log).
import type { PackcamAgentStatus, PackcamPlace, PackcamSettings, PackcamSpace } from '../../types/packcam';

export const PLACE_NAME: Record<PackcamPlace, string> = { recording: 'Office PC disk', pc: 'Office PC videos folder', dropbox: 'Dropbox', gdrive: 'Google Drive' };

export const spaceText = (s: PackcamSpace) =>
  s.checking ? 'Checking…'
  : s.error ? `Could not check — ${s.error}`
  : s.free_gb == null ? 'No limit'
  : `${s.free_gb} GB free${s.total_gb ? ` of ${s.total_gb} GB` : ''}${s.days != null ? ` · about ${s.days} day${s.days === 1 ? '' : 's'} left` : ''}`;

export interface StorageAlert { place: PackcamPlace; level: 'low' | 'full'; text: string; short: string }

/** Places that are almost full or full, worst first. */
export function storageAlerts(agent: PackcamAgentStatus): StorageAlert[] {
  const st = agent.storage || {};
  const out: StorageAlert[] = [];
  for (const place of ['pc', 'dropbox', 'gdrive', 'recording'] as PackcamPlace[]) {
    const s = st[place];
    if (!s || s.level === 'ok') continue;
    // The videos folder is usually on the same disk as the recording: say it once.
    if (place === 'recording' && st.pc && st.pc.level !== 'ok' && st.pc.free_gb === s.free_gb) continue;
    const name = PLACE_NAME[place];
    const left = `${s.free_gb ?? 0} GB left${s.days != null ? `, about ${s.days} day${s.days === 1 ? '' : 's'} of videos` : ''}`;
    if (s.level === 'full') out.push({ place, level: 'full', short: `${name} is full`,
      text: place === 'recording' ? `${name} is full (${left}) — Pack Cam keeps only the last hour of recording. Free up space on the PC.`
        : `${name} is full (${left}) — new videos cannot be saved there. Delete old videos or get more space.` });
    else out.push({ place, level: 'low', short: `${name} almost full`, text: `${name} is almost full (${left}). Delete old videos soon.` });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'full' ? -1 : 1));
}

/**
 * Was Pack Cam switched on at `t` (ms)? From the on/off log; before the first
 * entry it was the opposite of that entry, and with no log, as it is now.
 */
export function enabledAt(s: Pick<PackcamSettings, 'enabled' | 'enabled_log'>, t: number): boolean {
  const log = s.enabled_log || [];
  let on = log.length ? !log[0].on : s.enabled;
  for (const e of log) { if (Date.parse(e.at) <= t) on = e.on; else break; }
  return on;
}

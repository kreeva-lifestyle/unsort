// Pack Cam → Storage: where clips are saved (PC / Dropbox / Google Drive —
// any combination), clip length and housekeeping. On/off is the switch at the
// top of Pack Cam (PackCamSwitch); this form saves only its own fields.
import { useEffect, useRef, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import type { PackcamSettings } from '../../../types/packcam';
import { patchSettings } from './packcamApi';

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 12 };
const head: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora, marginBottom: 4 };
const note: React.CSSProperties = { fontSize: 11, color: T.tx3, lineHeight: 1.5 };

type FolderKey = 'pc_folder' | 'dropbox_folder' | 'gdrive_folder_name';
const TARGETS: { k: keyof PackcamSettings['targets']; label: string; hint: string; folder: FolderKey; folderLabel: string; placeholder: string }[] = [
  { k: 'pc', label: 'Office PC', hint: 'Kept on the PC disk. Plays on the office Wi-Fi.', folder: 'pc_folder', folderLabel: 'Folder on the PC', placeholder: 'D:\\Packing Videos  (blank = C:\\PackCam\\clips)' },
  { k: 'dropbox', label: 'Dropbox', hint: 'Uses the Dropbox account connected in Minis → Dropbox. Plays anywhere.', folder: 'dropbox_folder', folderLabel: 'Dropbox folder', placeholder: '/PackCam' },
  { k: 'gdrive', label: 'Google Drive', hint: 'Needs a one-time Google sign-in on the PC (see the agent README).', folder: 'gdrive_folder_name', folderLabel: 'Google Drive folder', placeholder: 'PackCam  (or Packing/Videos)' },
];
// A Windows folder (D:\x, \\server\share\x) or an absolute path; no characters Windows refuses.
const PC_FOLDER = /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+|\/)[^:*?"<>|]*$/;
const NUMS: { k: 'max_clip_seconds' | 'pre_roll_seconds' | 'post_roll_seconds' | 'buffer_hours'; label: string; min: number; max: number; unit: string }[] = [
  { k: 'max_clip_seconds', label: 'Longest video (whole video)', min: 30, max: 3600, unit: 'seconds' },
  { k: 'pre_roll_seconds', label: 'Start before scan', min: 0, max: 60, unit: 'seconds' },
  { k: 'post_roll_seconds', label: 'Keep after next scan', min: 0, max: 60, unit: 'seconds' },
  { k: 'buffer_hours', label: 'Raw recording kept on PC', min: 1, max: 72, unit: 'hours' },
];

// The fields this form owns: saving never writes the on/off switch or a camera test.
const OWN = ['targets', 'pc_folder', 'dropbox_folder', 'gdrive_folder_name', 'max_clip_seconds', 'pre_roll_seconds', 'post_roll_seconds', 'buffer_hours'] as const;
type Own = Pick<PackcamSettings, typeof OWN[number]>;
const own = (s: PackcamSettings): Own => Object.fromEntries(OWN.map(k => [k, s[k]])) as Own;

export default function StoragePanel({ settings, onSaved, addToast }: { settings: PackcamSettings; onSaved: (s: PackcamSettings) => void; addToast: (m: string, t?: string) => void }) {
  const [f, setF] = useState<Own>(() => own(settings));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // Follow the saved settings only when they really change (the page refreshes
  // every 30 s for the PC status) and never over edits not yet saved.
  const synced = useRef(JSON.stringify(own(settings)));
  const dirty = JSON.stringify(f) !== synced.current;
  useEffect(() => {
    const next = JSON.stringify(own(settings));
    if (next === synced.current) return;
    if (!dirty) setF(own(settings));
    synced.current = next;
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps -- `dirty` is read at the moment the saved values change

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!f.targets.pc && !f.targets.dropbox && !f.targets.gdrive) { setErr('Pick at least one place to save the videos'); return; }
    for (const n of NUMS) {
      const v = f[n.k];
      if (!Number.isInteger(v) || v < n.min || v > n.max) { setErr(`${n.label}: enter a whole number from ${n.min} to ${n.max}`); return; }
    }
    if (f.max_clip_seconds < f.pre_roll_seconds + 10) { setErr('Longest video must be at least 10 seconds more than "Start before scan"'); return; }
    const pcFolder = (f.pc_folder || '').trim().replace(/[\\/]+$/, (m, i) => (i <= 2 ? m : ''));
    if (pcFolder && !PC_FOLDER.test(pcFolder)) { setErr('PC folder: a full folder path like D:\\Packing Videos, or leave it blank'); return; }
    if (!/^\/[^\\:*?"<>|]*$/.test(f.dropbox_folder.trim())) { setErr('Dropbox folder must start with /, e.g. /PackCam'); return; }
    if (!f.gdrive_folder_name.trim() || /[\\]/.test(f.gdrive_folder_name)) { setErr('Google Drive folder: a name like PackCam, or Packing/Videos for a folder inside another'); return; }
    const clean = { ...f, pc_folder: pcFolder, dropbox_folder: f.dropbox_folder.trim().replace(/\/+$/, '') || '/PackCam', gdrive_folder_name: f.gdrive_folder_name.trim().replace(/^\/+|\/+$/g, '') };
    setSaving(true); setErr('');
    try { const all = await patchSettings(clean); setF(clean); synced.current = JSON.stringify(own(all)); onSaved(all); addToast('Pack Cam settings saved', 'success'); }
    catch (e2) { setErr(friendlyError(e2)); addToast(friendlyError(e2), 'error'); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={save}>
      <div style={card}>
        <div style={{ ...head, marginBottom: 10 }}>Save videos to</div>
        {TARGETS.map(t => (
          <div key={t.k} style={{ padding: '8px 0 12px', borderBottom: `1px solid ${T.bd}` }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, cursor: 'pointer' }}>
              <input type="checkbox" checked={f.targets[t.k]} onChange={() => { setF(p => ({ ...p, targets: { ...p.targets, [t.k]: !p.targets[t.k] } })); setErr(''); }} style={{ width: 18, height: 18, marginTop: 1, accentColor: T.ac }} />
              <span><span style={{ fontSize: 13, color: T.tx, fontWeight: 500 }}>{t.label}</span><span style={{ display: 'block', ...note }}>{t.hint}</span></span>
            </label>
            <div style={{ paddingLeft: 28, opacity: f.targets[t.k] ? 1 : 0.55 }}>
              <label style={S.fLabel}>{t.folderLabel}</label>
              <input value={f[t.folder] || ''} onChange={e => { const v = e.target.value; setF(p => ({ ...p, [t.folder]: v })); setErr(''); }} placeholder={t.placeholder} spellCheck={false} style={{ ...S.fInput, fontFamily: T.mono }} aria-label={t.folderLabel} />
            </div>
          </div>
        ))}
        <div style={{ ...note, marginTop: 10 }}>Each video is named by the tracking ID scanned, e.g. SF4156451997AJI.mp4, in one folder per day (2026-10-17). The same tracking ID twice on one day gets the scan time added (SF4156451997AJI_143005.mp4). Videos from an H.264 camera are copied exactly as recorded; an H.265 camera's videos are converted to H.264 on the PC so every phone and browser can play them.</div>
      </div>

      <div style={card}>
        <div style={{ ...head, marginBottom: 10 }}>Clip length</div>
        <div className="pc-num-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
          {NUMS.map(n => (
            <div key={n.k}>
              <label style={S.fLabel}>{n.label}</label>
              <input type="number" min={n.min} max={n.max} value={Number.isFinite(f[n.k]) ? f[n.k] : ''} onKeyDown={e => numericKeyDown(e)} onChange={e => { setF(p => ({ ...p, [n.k]: e.target.value === '' ? NaN : Number(e.target.value) })); setErr(''); }} style={S.fInput} />
              <div style={{ ...note, marginTop: 3 }}>{n.unit}</div>
            </div>
          ))}
        </div>
        <div style={{ ...note, marginTop: 10 }}>A clip runs from the scan to the next scan on the same camera, never longer than the longest-clip limit. Pack Cam never deletes clips — clear old ones from the PC folder, Dropbox or Drive yourself.</div>
      </div>

      {err && <div style={{ marginBottom: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {dirty && <button type="button" onClick={() => { setF(JSON.parse(synced.current)); setErr(''); }} style={{ ...S.btnGhost, minHeight: 44 }}>Undo changes</button>}
        <button type="submit" style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving || !dirty ? 'none' : 'auto', opacity: saving || !dirty ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save settings'}</button>
      </div>
    </form>
  );
}

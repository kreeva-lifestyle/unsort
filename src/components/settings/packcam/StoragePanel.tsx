// Pack Cam → Storage: recording on/off, where clips are saved (PC / Dropbox /
// Google Drive — any combination), clip length and housekeeping.
import { useEffect, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import Toggle from '../../ui/Toggle';
import type { PackcamSettings } from '../../../types/packcam';
import { saveSettings } from './packcamApi';

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 12 };
const head: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora, marginBottom: 4 };
const note: React.CSSProperties = { fontSize: 11, color: T.tx3, lineHeight: 1.5 };

const TARGETS: { k: keyof PackcamSettings['targets']; label: string; hint: string }[] = [
  { k: 'pc', label: 'Office PC', hint: 'Kept on the PC disk. Plays on the office Wi-Fi.' },
  { k: 'dropbox', label: 'Dropbox', hint: 'Uses the Dropbox account connected in Minis → Dropbox. Plays anywhere.' },
  { k: 'gdrive', label: 'Google Drive', hint: 'Needs a one-time Google sign-in on the PC (see the agent README).' },
];
const NUMS: { k: 'max_clip_seconds' | 'pre_roll_seconds' | 'post_roll_seconds' | 'buffer_hours' | 'auto_delete_days'; label: string; min: number; max: number; unit: string }[] = [
  { k: 'max_clip_seconds', label: 'Longest clip', min: 30, max: 3600, unit: 'seconds' },
  { k: 'pre_roll_seconds', label: 'Start before scan', min: 0, max: 60, unit: 'seconds' },
  { k: 'post_roll_seconds', label: 'Keep after next scan', min: 0, max: 60, unit: 'seconds' },
  { k: 'buffer_hours', label: 'Raw recording kept on PC', min: 1, max: 72, unit: 'hours' },
  { k: 'auto_delete_days', label: 'Auto-delete clips after', min: 0, max: 3650, unit: 'days (0 = never)' },
];

export default function StoragePanel({ settings, onSaved, addToast }: { settings: PackcamSettings; onSaved: (s: PackcamSettings) => void; addToast: (m: string, t?: string) => void }) {
  const [f, setF] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setF(settings); }, [settings]);
  const dirty = JSON.stringify(f) !== JSON.stringify(settings);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!f.targets.pc && !f.targets.dropbox && !f.targets.gdrive) { setErr('Pick at least one place to save the videos'); return; }
    for (const n of NUMS) {
      const v = f[n.k];
      if (!Number.isInteger(v) || v < n.min || v > n.max) { setErr(`${n.label}: enter a whole number from ${n.min} to ${n.max}`); return; }
    }
    if (f.targets.dropbox && !/^\/[^\\:*?"<>|]*$/.test(f.dropbox_folder.trim())) { setErr('Dropbox folder must start with /, e.g. /PackCam'); return; }
    if (f.targets.gdrive && !f.gdrive_folder_name.trim()) { setErr('Enter a Google Drive folder name'); return; }
    const clean = { ...f, dropbox_folder: f.dropbox_folder.trim().replace(/\/+$/, '') || '/PackCam', gdrive_folder_name: f.gdrive_folder_name.trim() };
    setSaving(true); setErr('');
    try { await saveSettings(clean); onSaved(clean); addToast('Pack Cam settings saved', 'success'); }
    catch (e2) { setErr(friendlyError(e2)); addToast(friendlyError(e2), 'error'); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={save}>
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div><div style={head}>Record packing videos</div><div style={note}>{f.enabled ? 'On — every scan on a camera with an IP address gets a video.' : 'Off — the PC does not record.'}</div></div>
        <Toggle on={f.enabled} onToggle={() => setF(p => ({ ...p, enabled: !p.enabled }))} label="Record packing videos" />
      </div>

      <div style={card}>
        <div style={{ ...head, marginBottom: 10 }}>Save videos to</div>
        {TARGETS.map(t => (
          <label key={t.k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', minHeight: 44, cursor: 'pointer', borderBottom: `1px solid ${T.bd}` }}>
            <input type="checkbox" checked={f.targets[t.k]} onChange={() => { setF(p => ({ ...p, targets: { ...p.targets, [t.k]: !p.targets[t.k] } })); setErr(''); }} style={{ width: 18, height: 18, marginTop: 1, accentColor: T.ac }} />
            <span><span style={{ fontSize: 13, color: T.tx, fontWeight: 500 }}>{t.label}</span><span style={{ display: 'block', ...note }}>{t.hint}</span></span>
          </label>
        ))}
        {f.targets.dropbox && <div style={{ marginTop: 10 }}><label style={S.fLabel}>Dropbox folder</label><input value={f.dropbox_folder} onChange={e => setF(p => ({ ...p, dropbox_folder: e.target.value }))} style={{ ...S.fInput, fontFamily: T.mono }} /></div>}
        {f.targets.gdrive && <div style={{ marginTop: 10 }}><label style={S.fLabel}>Google Drive folder</label><input value={f.gdrive_folder_name} onChange={e => setF(p => ({ ...p, gdrive_folder_name: e.target.value }))} style={S.fInput} /></div>}
        <div style={{ ...note, marginTop: 10 }}>Videos are copied exactly as the camera records them — no quality is lost. Clips go into one folder per day.</div>
      </div>

      <div style={card}>
        <div style={{ ...head, marginBottom: 10 }}>Clip length & clean-up</div>
        <div className="pc-num-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
          {NUMS.map(n => (
            <div key={n.k}>
              <label style={S.fLabel}>{n.label}</label>
              <input type="number" min={n.min} max={n.max} value={Number.isFinite(f[n.k]) ? f[n.k] : ''} onKeyDown={e => numericKeyDown(e)} onChange={e => { setF(p => ({ ...p, [n.k]: e.target.value === '' ? NaN : Number(e.target.value) })); setErr(''); }} style={S.fInput} />
              <div style={{ ...note, marginTop: 3 }}>{n.unit}</div>
            </div>
          ))}
        </div>
        <div style={{ ...note, marginTop: 10 }}>A clip runs from the scan to the next scan on the same camera, never longer than the longest-clip limit.</div>
      </div>

      {err && <div style={{ marginBottom: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {dirty && <button type="button" onClick={() => { setF(settings); setErr(''); }} style={{ ...S.btnGhost, minHeight: 44 }}>Undo changes</button>}
        <button type="submit" style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving || !dirty ? 'none' : 'auto', opacity: saving || !dirty ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save settings'}</button>
      </div>
    </form>
  );
}

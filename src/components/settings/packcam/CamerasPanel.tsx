// Pack Cam → Cameras: how the office PC reaches each packing-table camera.
// Camera numbers themselves are added in Settings → PackStation; here each one
// gets its IP address, RTSP port/path and login. The password is write-only.
import { useCallback, useEffect, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import { SkeletonRows } from '../../ui/Skeleton';
import Empty from '../../ui/Empty';
import type { PackcamAgentStatus } from '../../../types/packcam';
import { loadCameras, saveCamera, type CameraConn } from './packcamApi';

const IP = /^[A-Za-z0-9.-]{1,253}$/;

function CameraCard({ cam, hasPassword, live, onSaved, addToast }: { cam: CameraConn; hasPassword: boolean; live?: { ok: boolean; error: string | null }; onSaved: () => void; addToast: (m: string, t?: string) => void }) {
  const [f, setF] = useState(cam);
  const [pw, setPw] = useState('');
  const [clearPw, setClearPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // Reset this card only when its own saved values change — saving another
  // camera reloads the list and must not wipe what is typed here.
  const sig = [cam.id, cam.ip, cam.rtsp_port, cam.rtsp_path, cam.username, cam.is_active].join('|');
  useEffect(() => { setF(cam); setErr(''); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the saved values
  const set = (k: keyof CameraConn, v: string | number) => { setF(p => ({ ...p, [k]: v })); setErr(''); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const ip = (f.ip || '').trim();
    if (ip && !IP.test(ip)) { setErr('Enter the camera IP address like 192.168.1.64'); return; }
    if (!Number.isInteger(f.rtsp_port) || f.rtsp_port < 1 || f.rtsp_port > 65535) { setErr('RTSP port must be between 1 and 65535'); return; }
    if (!/^\/\S*$/.test(f.rtsp_path)) { setErr('Stream path must start with / and have no spaces'); return; }
    setSaving(true);
    try {
      await saveCamera({ ...f, ip }, clearPw ? '' : pw ? pw : null);
      addToast(`Camera ${cam.number} saved`, 'success');
      setPw(''); setClearPw(false);
      onSaved();
    } catch (e2) { setErr(friendlyError(e2)); addToast(friendlyError(e2), 'error'); }
    finally { setSaving(false); }
  };

  const status = !cam.ip ? { c: T.tx3, t: 'No IP address — not recorded' } : !live ? { c: T.yl, t: 'Waiting for the office PC' } : live.ok ? { c: T.gr, t: 'Recording' } : { c: T.re, t: live.error || 'Not recording' };
  return (
    <form onSubmit={save} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: T.sora, fontWeight: 700, fontSize: 13, color: T.tx }}>Camera {cam.number}{!cam.is_active && <span style={{ fontSize: 10, color: T.tx3, fontWeight: 500 }}> · disabled</span>}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.tx2 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: status.c }} />{status.t}</div>
      </div>
      <div className="pc-cam-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <div><label style={S.fLabel}>IP address</label><input value={f.ip || ''} onChange={e => set('ip', e.target.value)} placeholder="192.168.1.64" inputMode="decimal" style={S.fInput} /></div>
        <div><label style={S.fLabel}>RTSP port</label><input type="number" value={f.rtsp_port} onKeyDown={e => numericKeyDown(e)} onChange={e => set('rtsp_port', Number(e.target.value))} style={S.fInput} /></div>
        <div><label style={S.fLabel}>Stream path</label><input value={f.rtsp_path} onChange={e => set('rtsp_path', e.target.value)} style={{ ...S.fInput, fontFamily: T.mono }} /></div>
        <div><label style={S.fLabel}>User name</label><input value={f.username} onChange={e => set('username', e.target.value)} autoComplete="off" style={S.fInput} /></div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.fLabel}>Password {hasPassword && !clearPw && <span style={{ textTransform: 'none', color: T.gr }}>· saved</span>}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="password" value={pw} onChange={e => { setPw(e.target.value); setClearPw(false); }} placeholder={hasPassword ? 'Leave blank to keep the saved password' : 'Camera password'} autoComplete="new-password" style={{ ...S.fInput, flex: 1 }} />
            {hasPassword && <button type="button" onClick={() => { setClearPw(c => !c); setPw(''); }} style={{ ...S.btnGhost, minHeight: 36, color: clearPw ? T.re : T.tx3 }}>{clearPw ? 'Will clear' : 'Clear'}</button>}
          </div>
        </div>
      </div>
      {err && <div style={{ marginTop: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button type="submit" style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save camera'}</button>
      </div>
    </form>
  );
}

export default function CamerasPanel({ agent, addToast }: { agent: PackcamAgentStatus; addToast: (m: string, t?: string) => void }) {
  const [data, setData] = useState<{ cameras: CameraConn[]; hasPassword: Set<string> } | null>(null);
  const load = useCallback(() => { loadCameras().then(setData).catch(e => { addToast(friendlyError(e), 'error'); setData({ cameras: [], hasPassword: new Set() }); }); }, [addToast]);
  useEffect(() => { load(); }, [load]);
  const live = new Map((agent.cameras || []).map(c => [String(c.number), c]));

  if (!data) return <SkeletonRows rows={3} />;
  if (!data.cameras.length) return <Empty icon="box" title="No cameras yet" message="Add the camera numbers your packers pick in Settings → PackStation, then give each one its IP address here." />;
  return (
    <div>
      <div style={{ fontSize: 12, color: T.tx3, marginBottom: 10, lineHeight: 1.5 }}>Hikvision main stream: port 554, path /Streaming/Channels/101 (the full-quality stream); other brands often use /stream1. H.265 cameras work: their videos are converted to H.264 on the PC. Use the camera's own login. Each packer's scans are recorded on the camera number they pick in PackStation.</div>
      {data.cameras.map(c => <CameraCard key={c.id} cam={c} hasPassword={data.hasPassword.has(c.id)} live={live.get(String(c.number))} onSaved={load} addToast={addToast} />)}
    </div>
  );
}

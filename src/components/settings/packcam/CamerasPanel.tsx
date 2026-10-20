// Pack Cam → Cameras: how the office PC reaches each packing-table camera.
// Camera numbers themselves are added in Settings → PackStation; here each one
// gets its IP address, RTSP port/path and login. The password is write-only.
// "Test connection" asks the office PC to try every camera once (a new
// settings.test_nonce; the PC answers in its heartbeat within a few seconds)
// and lets a camera stopped for a wrong password try again.
import { useCallback, useEffect, useRef, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import { SkeletonRows } from '../../ui/Skeleton';
import Empty from '../../ui/Empty';
import type { PackcamAgentStatus } from '../../../types/packcam';
import { logSwallowed } from '../../../lib/errorLogger';
import { agentOnline, loadCameras, loadSettings, patchSettings, saveCamera, type CameraConn } from './packcamApi';

type TestAnswer = { ok: boolean; message: string };
interface TestProps { testing: boolean; answer?: TestAnswer; onTest: () => void }
// The PC sees the press on its next check-in (5 s), tries every camera at once
// (an unreachable one takes ~10-25 s) and answers on the check-in after.
const TEST_WAIT_MS = 60_000;
const newer = (v: string | undefined, than: string) => { const a = String(v || '0').split('.').map(Number); const b = than.split('.').map(Number); for (let i = 0; i < 3; i++) if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; return true; };

const IP = /^[A-Za-z0-9.-]{1,253}$/;

function CameraCard({ cam, hasPassword, live, onSaved, addToast, test }: { cam: CameraConn; hasPassword: boolean; live?: { ok: boolean; error: string | null }; onSaved: () => void; addToast: (m: string, t?: string) => void; test?: TestProps }) {
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

  const unsaved = !!pw || clearPw || ['ip', 'rtsp_port', 'rtsp_path', 'username'].some(k => String(f[k as keyof CameraConn] ?? '') !== String(cam[k as keyof CameraConn] ?? ''));
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
      {test?.answer && <div role="status" style={{ marginTop: 10, background: test.answer.ok ? T.gr22 : 'rgba(239,68,68,.08)', border: `1px solid ${test.answer.ok ? T.gr : 'rgba(239,68,68,.2)'}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, color: test.answer.ok ? T.gr : T.re, lineHeight: 1.5 }}>{test.answer.ok ? '✓ ' : ''}{test.answer.message}</div>}
      {err && <div style={{ marginTop: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {test && cam.ip && cam.is_active && <button type="button" onClick={() => { if (unsaved) { setErr('Save the camera first, then test it'); return; } test.onTest(); }} style={{ ...S.btnGhost, minHeight: 44, pointerEvents: test.testing ? 'none' : 'auto', opacity: test.testing ? 0.5 : 1 }}>{test.testing ? 'Testing…' : 'Test connection'}</button>}
        <button type="submit" style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save camera'}</button>
      </div>
    </form>
  );
}

export default function CamerasPanel({ agent, isAdmin, onTested, addToast }: { agent: PackcamAgentStatus; isAdmin: boolean; onTested: () => void; addToast: (m: string, t?: string) => void }) {
  const [data, setData] = useState<{ cameras: CameraConn[]; hasPassword: Set<string> } | null>(null);
  const load = useCallback(() => { loadCameras().then(setData).catch(e => { addToast(friendlyError(e), 'error'); setData({ cameras: [], hasPassword: new Set() }); }); }, [addToast]);
  useEffect(() => { load(); }, [load]);
  const live = new Map((agent.cameras || []).map(c => [String(c.number), c]));

  // Test connection: the press time is the nonce; answers come back in the heartbeat.
  const [testing, setTesting] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, TestAnswer>>({});
  const [testErr, setTestErr] = useState('');
  const latest = useRef({ agent, data, onTested, addToast });
  latest.current = { agent, data, onTested, addToast };
  const runTest = async () => {
    if (testing) return;
    setTestErr(''); setAnswers({});
    if (!agentOnline(agent)) { setTestErr(agent.last_seen ? 'The office PC is offline — switch it on and check its internet / Wi-Fi, then test again' : 'The office PC has not connected yet — finish the setup steps in Status & setup first'); return; }
    const nonce = String(Date.now());
    setTesting(nonce);
    try { await patchSettings({ test_nonce: nonce }); }
    catch (e) { setTesting(null); addToast(friendlyError(e), 'error'); }
  };
  useEffect(() => {
    if (!testing) return;
    const until = Date.now() + TEST_WAIT_MS;
    const t = setInterval(async () => {
      try {
        const { agent: a } = await loadSettings();
        const { data: d } = latest.current;
        const want = (d?.cameras || []).filter(c => c.ip && c.is_active).map(c => String(c.number));
        const got: Record<string, TestAnswer> = {};
        for (const n of want) { const r = a.tests?.[n]; if (r?.nonce === testing) got[n] = { ok: r.ok, message: r.message }; }
        setAnswers(got);
        if (want.every(n => got[n])) { setTesting(null); latest.current.onTested(); latest.current.addToast('Connection test finished', 'success'); return; }
        if (Date.now() > until) {
          setTesting(null);
          const missing = want.filter(n => !got[n]);
          setTestErr(!newer(a.version, '1.4.0') ? 'The office PC has an older Pack Cam that cannot test — download the PC program again and unzip it over the old one (your key is kept)'
            : Object.keys(got).length ? `No answer yet for camera ${missing.join(', ')} — the PC could not finish testing it. Press Test connection again in a minute.`
            : 'No answer from the office PC — is it on and connected to the internet?');
        }
      } catch (e) { logSwallowed('packcam connection test', e); }
    }, 3000);
    return () => clearInterval(t);
  }, [testing]);

  if (!data) return <SkeletonRows rows={3} />;
  if (!data.cameras.length) return <Empty icon="box" title="No cameras yet" message="Add the camera numbers your packers pick in Settings → PackStation, then give each one its IP address here." />;
  return (
    <div>
      <div style={{ fontSize: 12, color: T.tx3, marginBottom: 10, lineHeight: 1.5 }}>Hikvision main stream: port 554, path /Streaming/Channels/101 (the full-quality stream); other brands often use /stream1. H.265 cameras work: their videos are converted to H.264 on the PC. Use the camera's own login. Each packer's scans are recorded on the camera number they pick in PackStation.</div>
      {testErr && <div style={{ marginBottom: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: T.re, lineHeight: 1.5 }}>{testErr}</div>}
      {data.cameras.map(c => <CameraCard key={c.id} cam={c} hasPassword={data.hasPassword.has(c.id)} live={live.get(String(c.number))} onSaved={load} addToast={addToast}
        test={isAdmin ? { testing: !!testing, answer: answers[String(c.number)], onTest: runTest } : undefined} />)}
    </div>
  );
}

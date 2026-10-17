// Pack Cam → Status & setup: is the office PC recording, the agent key, and
// the setup steps for the PC.
import { useEffect, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { copyToClipboard } from '../../../lib/clipboard';
import { logSwallowed } from '../../../lib/errorLogger';
import ConfirmModal, { useConfirm } from '../../ui/ConfirmModal';
import type { PackcamAgentStatus } from '../../../types/packcam';
import { agentOnline, newAgentKey, scansWithoutAddress } from './packcamApi';

declare const __PACKCAM_AGENT_VERSION__: string; // tools/packcam-agent/package.json, via vite define
/** "1.0.0" < "1.1.0", number by number. */
const older = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };
const UPDATE_URL = '/packcam/PackCam-PC-Update.zip';

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 12 };
const head: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora, marginBottom: 10 };
const Dot = ({ ok, warn }: { ok: boolean; warn?: boolean }) => <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? T.gr : warn ? T.yl : T.re, display: 'inline-block', flexShrink: 0 }} />;
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: `1px solid ${T.bd}`, fontSize: 12 }}>
    <span style={{ color: T.tx3 }}>{label}</span><span style={{ color: T.tx2, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
  </div>
);

// Short version of the "Pack Cam setup guide" PDF (with pictures) given to the owner.
const STEPS = [
  'On the office PC install Node.js and ffmpeg (PowerShell: winget install OpenJS.NodeJS.LTS, then winget install Gyan.FFmpeg).',
  'On the office PC press "PC program (zip)" above, then right-click the downloaded file → Extract All → type C:\\PackCam → Extract. You get C:\\PackCam\\agent.',
  'Press "Create agent key" above and paste it into config.json in that folder, between the quotes after "agent_key".',
  'In the Cameras tab, enter each camera\'s IP address and password, and Save.',
  'Double-click start.bat and allow it through the firewall. Open http://localhost:8765 on the PC: each camera should say "Recording". Then right-click install-startup.bat → Run as administrator, once.',
  'In the Storage tab choose where videos go (PC / Dropbox / Google Drive and their folders) and turn recording on.',
];

export default function AgentPanel({ agent, recording, isAdmin, addToast }: { agent: PackcamAgentStatus; recording: boolean; isAdmin: boolean; addToast: (m: string, t?: string) => void }) {
  const [key, setKey] = useState('');
  const [unwatched, setUnwatched] = useState<{ number: string; count: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const { ask, modalProps } = useConfirm();
  const online = agentOnline(agent);
  const seen = agent.last_seen ? new Date(agent.last_seen).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  // Scans on a camera number with no address are skipped by the PC. A hint
  // only: a failed check just leaves the warning out.
  useEffect(() => {
    if (!recording) { setUnwatched([]); return; }
    let live = true;
    scansWithoutAddress().then(r => { if (live) setUnwatched(r); }).catch(e => logSwallowed('packcam unwatched cameras', e));
    return () => { live = false; };
  }, [recording]);

  const create = async () => {
    if (busy) return;
    if (agent.last_seen && !await ask({ title: 'Create a new agent key?', message: 'The PC stops working until the new key is pasted into its config.json and Pack Cam is restarted.', confirmLabel: 'Create key', danger: true })) return;
    setBusy(true);
    try { setKey(await newAgentKey()); addToast('Agent key created — copy it now, it is shown only once', 'success'); }
    catch (e) { addToast(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    if (await copyToClipboard(key)) addToast('Key copied', 'success');
    else addToast('Could not copy — select the key and copy it by hand', 'error');
  };

  return (
    <div>
      <div style={card}>
        <div style={{ ...head, display: 'flex', alignItems: 'center', gap: 8 }}><Dot ok={online} warn={!!seen} />Office PC {online ? 'online' : seen ? 'offline' : 'not connected yet'}</div>
        {!seen && <div style={{ fontSize: 12, color: T.tx3 }}>Follow the setup steps below. This turns green once the PC checks in.</div>}
        {agent.version && older(agent.version, __PACKCAM_AGENT_VERSION__) && (
          <div style={{ margin: '8px 0', background: T.ac3, border: `1px solid ${T.ac44}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, color: T.tx2, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, color: T.ac2, marginBottom: 4 }}>Update the PC program: this PC runs {agent.version}, version {__PACKCAM_AGENT_VERSION__} is ready</div>
            On the office PC press <a href={UPDATE_URL} download="PackCam-PC-Update.zip" style={{ color: T.ac2, fontWeight: 600 }}>PC update (zip)</a>, right-click the downloaded file → Extract All → type C:\PackCam → Extract → "Replace the files in the destination". Then close the black Pack Cam window and double-click start.bat in C:\PackCam\agent (or restart the PC). The agent key and settings stay as they are.
          </div>
        )}
        {unwatched.map(u => (
          <div key={u.number} style={{ margin: '8px 0', background: T.yl22, border: `1px solid ${T.yl88}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, color: T.yl, lineHeight: 1.5 }}>
            Camera {u.number}: {u.count} scan{u.count === 1 ? '' : 's'} in the last 24 hours but no camera address, so no video was saved. If packers pick Camera {u.number} in PackStation, enter that camera's address under Camera {u.number} in the Cameras tab.
          </div>
        ))}
        {seen && <>
          <Row label="Last check-in">{seen}</Row>
          {agent.host && <Row label="PC">{agent.host} · agent {agent.version}</Row>}
          <Row label="Recording">{agent.enabled ? 'On' : 'Off (Storage tab)'}</Row>
          {agent.disk && <Row label="Disk free">{agent.disk.free_gb ?? '—'} GB of {agent.disk.total_gb ?? '—'} GB · recording buffer {agent.buffer_gb ?? 0} GB</Row>}
          {agent.queue && <Row label="Clips waiting">{agent.queue.waiting}{agent.queue.failed ? ` · ${agent.queue.failed} failed` : ''}</Row>}
          {(agent.cameras || []).map(c => (
            <Row key={c.number} label={`Camera ${c.number}`}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Dot ok={c.ok} />{c.ok ? 'Recording' : c.error || 'Not recording'}</span></Row>
          ))}
          {agent.dropbox && <Row label="Dropbox">{agent.dropbox.ok ? 'Ready' : agent.dropbox.error || 'Waiting'}</Row>}
          {agent.gdrive && <Row label="Google Drive">{agent.gdrive.connected ? 'Connected' : agent.gdrive.configured ? 'Not signed in — open http://localhost:8765 on the PC' : 'Not set up on the PC (see README)'}</Row>}
          {agent.pc_folder && <Row label="Clips folder on PC">{agent.pc_folder}</Row>}
          {agent.lan_url && <Row label="Office address">{agent.lan_url}</Row>}
          {agent.last_error && <div style={{ marginTop: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{agent.last_error}</div>}
        </>}
      </div>

      {isAdmin && <div style={card}>
        <div style={head}>Agent key</div>
        <div style={{ fontSize: 12, color: T.tx3, marginBottom: 10 }}>The PC signs in with this key. Creating a new one stops the old one.</div>
        {key && <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <input readOnly value={key} onFocus={e => e.currentTarget.select()} style={{ ...S.fInput, fontFamily: T.mono, flex: '1 1 240px' }} aria-label="Agent key" />
          <button type="button" onClick={copy} style={{ ...S.btnGhost, minHeight: 44 }}>Copy</button>
        </div>}
        <button type="button" onClick={create} style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy ? 'Creating…' : 'Create agent key'}</button>
      </div>}

      <div style={card}>
        <div style={head}>Set up the office PC</div>
        <div style={{ fontSize: 12, color: T.tx3, marginBottom: 10, lineHeight: 1.5 }}>The setup guide walks through every step with pictures. Download the PC program on the office PC itself.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <a href="/packcam/Pack-Cam-Setup-Guide.pdf" target="_blank" rel="noopener" style={{ ...S.btnPrimary, minHeight: 44, textDecoration: 'none' }}>Setup guide (PDF)</a>
          <a href="/packcam/PackCam-PC-Setup.zip" download="PackCam-PC-Setup.zip" style={{ ...S.btnGhost, minHeight: 44, textDecoration: 'none' }}>PC program (zip)</a>
          <a href={UPDATE_URL} download="PackCam-PC-Update.zip" title="For a PC that already has Pack Cam: keeps its key and settings" style={{ ...S.btnGhost, minHeight: 44, textDecoration: 'none' }}>PC update (zip)</a>
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {STEPS.map((s, i) => <li key={i} style={{ fontSize: 12, color: T.tx2, lineHeight: 1.5 }}>{s}</li>)}
        </ol>
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 10, lineHeight: 1.5 }}>Each scan's video runs from that scan to the next scan on the same camera, copied as the camera records it; an H.265 camera's videos are converted to H.264 on the PC so they play on every phone and browser. Keep the PC on and set to never sleep.</div>
      </div>
      <ConfirmModal {...modalProps} />
    </div>
  );
}

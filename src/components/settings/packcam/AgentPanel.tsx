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
import { PLACE_NAME, spaceText, storageAlerts, uploadProblems } from '../../packcam/packcamHealth';

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
  'In the Cameras tab, enter each camera\'s IP address and password, Save, then press Test connection once the PC is running.',
  'In C:\\PackCam\\agent double-click start.bat and allow it through the firewall. Notepad opens key.txt: press "Create agent key" above, copy it, paste it on the empty line in Notepad, save (Ctrl+S) and close Notepad — Pack Cam starts by itself.',
  'Open http://localhost:8765 on the PC: each camera should say "Recording". Then right-click install-startup.bat → Run as administrator, once: it closes that window, and Pack Cam now runs in the background with no window and starts by itself when the PC signs in (stop.bat stops it).',
  'In the Storage tab choose where videos go (PC / Dropbox / Google Drive and their folders), and turn Pack Cam on with the switch at the top.',
  'To update the PC program later: download the zip again and extract it to C:\\PackCam again, choosing "Replace". The key (C:\\PackCam\\key.txt) and settings are kept.',
];

export default function AgentPanel({ agent, recording, isAdmin, addToast }: { agent: PackcamAgentStatus; recording: boolean; isAdmin: boolean; addToast: (m: string, t?: string) => void }) {
  const [key, setKey] = useState('');
  const [unwatched, setUnwatched] = useState<{ number: string; count: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const { ask, modalProps } = useConfirm();
  const online = agentOnline(agent);
  const alerts = recording ? storageAlerts(agent) : [];
  const uploadsFailing = recording ? uploadProblems(agent) : [];
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
    if (agent.last_seen && !await ask({ title: 'Create a new agent key?', message: 'The PC stops working until the new key is pasted into C:\\PackCam\\key.txt on the PC and saved (Pack Cam picks it up by itself).', confirmLabel: 'Create key', danger: true })) return;
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
        {seen && !online && recording && <div style={{ margin: '8px 0', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: T.re, lineHeight: 1.5 }}>
          No packing videos are being saved. Check the office PC is switched on (after a power cut, switch it on — Pack Cam starts by itself when Windows signs in) and that its internet / Wi-Fi works.
        </div>}
        {uploadsFailing.map(t => (
          <div key={t} style={{ margin: '8px 0', background: T.yl22, border: `1px solid ${T.yl88}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, color: T.yl, lineHeight: 1.5 }}>{t}. Videos stay on the PC and are sent again every few minutes; check the account (full? signed out?).</div>
        ))}
        {alerts.map(a => (
          <div key={a.place} style={{ margin: '8px 0', background: a.level === 'full' ? 'rgba(239,68,68,.08)' : T.yl22, border: `1px solid ${a.level === 'full' ? 'rgba(239,68,68,.2)' : T.yl88}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, color: a.level === 'full' ? T.re : T.yl, lineHeight: 1.5 }}>{a.text}</div>
        ))}
        {unwatched.map(u => (
          <div key={u.number} style={{ margin: '8px 0', background: T.yl22, border: `1px solid ${T.yl88}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, color: T.yl, lineHeight: 1.5 }}>
            Camera {u.number}: {u.count} scan{u.count === 1 ? '' : 's'} in the last 24 hours but no camera address, so no video was saved. If packers pick Camera {u.number} in PackStation, enter that camera's address under Camera {u.number} in the Cameras tab.
          </div>
        ))}
        {seen && <>
          <Row label="Last check-in">{seen}</Row>
          {agent.host && <Row label="PC">{agent.host} · agent {agent.version}</Row>}
          <Row label="Recording">{agent.enabled ? 'On' : 'Off (switch at the top)'}</Row>
          {agent.storage ? (['recording', 'pc', 'dropbox', 'gdrive'] as const).map(k => {
            const sp = agent.storage?.[k];
            return sp ? <Row key={k} label={`Space · ${PLACE_NAME[k]}`}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Dot ok={sp.level === 'ok'} warn={sp.level === 'low'} />{spaceText(sp)}</span></Row> : null;
          }) : agent.disk && <Row label="Disk free">{agent.disk.free_gb ?? '—'} GB of {agent.disk.total_gb ?? '—'} GB</Row>}
          {agent.buffer_gb != null && <Row label="Recording kept on PC">{agent.buffer_gb} GB{agent.storage?.per_day_gb ? ` · videos ~${agent.storage.per_day_gb} GB a day` : ''}</Row>}
          {agent.queue && <Row label="Clips waiting">{agent.queue.waiting}{agent.queue.failed ? ` · ${agent.queue.failed} failed` : ''}</Row>}
          {(agent.cameras || []).map(c => (
            <Row key={c.number} label={`Camera ${c.number}`}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Dot ok={c.ok} />{c.ok ? 'Recording' : c.error || 'Not recording'}</span></Row>
          ))}
          {agent.dropbox && <Row label="Dropbox">{agent.dropbox.ok ? 'Ready' : agent.dropbox.error || 'Waiting'}</Row>}
          {agent.gdrive && <Row label="Google Drive">{agent.gdrive.upload_error ? agent.gdrive.upload_error : agent.gdrive.connected ? 'Connected' : agent.gdrive.configured ? 'Not signed in — open http://localhost:8765 on the PC' : 'Not set up on the PC (see README)'}</Row>}
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
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {STEPS.map((s, i) => <li key={i} style={{ fontSize: 12, color: T.tx2, lineHeight: 1.5 }}>{s}</li>)}
        </ol>
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 10, lineHeight: 1.5 }}>Each scan's video runs from that scan to the next scan on the same camera, copied as the camera records it; an H.265 camera's videos are converted to H.264 on the PC so they play on every phone and browser. Keep the PC on and set to never sleep; Pack Cam runs in the background, nothing needs to stay open.</div>
      </div>
      <ConfirmModal {...modalProps} />
    </div>
  );
}

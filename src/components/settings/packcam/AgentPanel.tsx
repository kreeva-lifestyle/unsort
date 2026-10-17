// Pack Cam → Status & setup: is the office PC recording, the agent key, and
// the setup steps for the PC.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { copyToClipboard } from '../../../lib/clipboard';
import ConfirmModal, { useConfirm } from '../../ui/ConfirmModal';
import type { PackcamAgentStatus } from '../../../types/packcam';
import { agentOnline, newAgentKey } from './packcamApi';

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 12 };
const head: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora, marginBottom: 10 };
const Dot = ({ ok, warn }: { ok: boolean; warn?: boolean }) => <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? T.gr : warn ? T.yl : T.re, display: 'inline-block', flexShrink: 0 }} />;
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: `1px solid ${T.bd}`, fontSize: 12 }}>
    <span style={{ color: T.tx3 }}>{label}</span><span style={{ color: T.tx2, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
  </div>
);

const STEPS = [
  'On the office PC install Node.js (LTS) from nodejs.org, and ffmpeg (PowerShell: winget install Gyan.FFmpeg).',
  'Copy the folder tools/packcam-agent from the DailyOffice code to the PC, e.g. C:\\PackCam\\agent. Rename config.example.json to config.json.',
  'Press "Create agent key" below and paste the key into "agent_key" in config.json.',
  'In the Cameras tab, enter each camera\'s IP address, user name and password.',
  'Double-click start.bat. Open http://localhost:8765 on the PC: each camera should say "Recording". Run install-startup.bat once so it starts with Windows.',
  'In the Storage tab choose PC / Dropbox / Google Drive and turn recording on. Every scan from then on gets its video.',
];

export default function AgentPanel({ agent, isAdmin, addToast }: { agent: PackcamAgentStatus; isAdmin: boolean; addToast: (m: string, t?: string) => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const { ask, modalProps } = useConfirm();
  const online = agentOnline(agent);
  const seen = agent.last_seen ? new Date(agent.last_seen).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

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
        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {STEPS.map((s, i) => <li key={i} style={{ fontSize: 12, color: T.tx2, lineHeight: 1.5 }}>{s}</li>)}
        </ol>
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 10, lineHeight: 1.5 }}>Each scan's video runs from that scan to the next scan on the same camera, copied exactly as the camera records it (no quality loss). Keep the PC on and set to never sleep.</div>
      </div>
      <ConfirmModal {...modalProps} />
    </div>
  );
}

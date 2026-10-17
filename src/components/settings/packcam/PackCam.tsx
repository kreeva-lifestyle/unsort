// Settings → Pack Cam: packing videos for PackStation scans. Owns the shared
// state (settings + the office PC's heartbeat) and the four sub-tabs.
import { useCallback, useEffect, useState } from 'react';
import { T } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { SkeletonRows } from '../../ui/Skeleton';
import { PACKCAM_DEFAULTS, type PackcamAgentStatus, type PackcamSettings } from '../../../types/packcam';
import { agentOnline, loadCameras, loadSettings } from './packcamApi';
import AgentPanel from './AgentPanel';
import CamerasPanel from './CamerasPanel';
import StoragePanel from './StoragePanel';
import ClipsPanel from './ClipsPanel';

type Sub = 'status' | 'cameras' | 'storage' | 'videos';
const SUBS: { id: Sub; label: string }[] = [{ id: 'status', label: 'Status & setup' }, { id: 'cameras', label: 'Cameras' }, { id: 'storage', label: 'Storage' }, { id: 'videos', label: 'Videos' }];

export default function PackCam({ addToast, isAdmin }: { addToast: (m: string, t?: string) => void; isAdmin: boolean }) {
  const [sub, setSub] = useState<Sub>('status');
  const [state, setState] = useState<{ settings: PackcamSettings; agent: PackcamAgentStatus } | null>(null);
  const [cameraNumbers, setCameraNumbers] = useState<string[]>([]);

  const load = useCallback(() => {
    loadSettings().then(setState).catch(e => { addToast(friendlyError(e), 'error'); setState(s => s || { settings: PACKCAM_DEFAULTS, agent: {} }); });
  }, [addToast]);
  useEffect(() => { load(); }, [load]);
  // The PC checks in every few seconds; refresh its status while this page is
  // on screen (Settings unmounts this tab when the user leaves the page).
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30_000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    loadCameras().then(d => setCameraNumbers(d.cameras.map(c => String(c.number)))).catch(e => addToast(friendlyError(e), 'error'));
  }, [addToast]);

  if (!state) return <SkeletonRows rows={4} />;
  const online = agentOnline(state.agent);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        {SUBS.map(s => (
          <button key={s.id} type="button" onClick={() => setSub(s.id)} style={{ minHeight: 44, padding: '6px 14px', borderRadius: 8, border: `1px solid ${sub === s.id ? T.ac : T.bd}`, background: sub === s.id ? T.ac3 : 'transparent', color: sub === s.id ? T.ac2 : T.tx2, fontSize: 12, fontWeight: sub === s.id ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: T.sans }}>
            {s.id === 'status' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? T.gr : state.agent.last_seen ? T.re : T.tx3 }} />}
            {s.label}
          </button>
        ))}
      </div>
      {sub === 'status' && <AgentPanel agent={state.agent} isAdmin={isAdmin} addToast={addToast} />}
      {sub === 'cameras' && <CamerasPanel agent={state.agent} addToast={addToast} />}
      {sub === 'storage' && <StoragePanel settings={state.settings} onSaved={s => setState(p => (p ? { ...p, settings: s } : p))} addToast={addToast} />}
      {sub === 'videos' && <ClipsPanel cameras={cameraNumbers} canDelete addToast={addToast} />}
    </div>
  );
}

// Settings → Pack Cam: the one on/off switch for the whole feature. Off: the
// office PC stops recording, PackStation shows no camera line, timer or video
// marks, and the Pack Cam warnings are left out. Every change is logged in
// settings.enabled_log, so a scan made while it was off says why it has no video.
import { useState } from 'react';
import { T } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import Toggle from '../../ui/Toggle';
import ConfirmModal, { useConfirm } from '../../ui/ConfirmModal';
import type { PackcamSettings } from '../../../types/packcam';
import { patchSettings } from './packcamApi';

const LOG_KEEP = 20;

export default function PackCamSwitch({ settings, isAdmin, onChanged, addToast }: { settings: PackcamSettings; isAdmin: boolean; onChanged: (s: PackcamSettings) => void; addToast: (m: string, t?: string) => void }) {
  const [saving, setSaving] = useState(false);
  const { ask, modalProps } = useConfirm();
  const on = settings.enabled;

  const flip = async () => {
    if (saving || !isAdmin) return;
    if (on && !await ask({ title: 'Turn Pack Cam off?', message: 'The office PC stops recording. Scans made while Pack Cam is off get no packing video, and PackStation stops showing the camera status and timer.', confirmLabel: 'Turn off', danger: true })) return;
    setSaving(true);
    try {
      const next = await patchSettings(now => ({ enabled: !on, enabled_log: [...(now.enabled_log || []), { at: new Date().toISOString(), on: !on }].slice(-LOG_KEEP) }));
      onChanged(next);
      addToast(on ? 'Pack Cam turned off' : 'Pack Cam turned on — the office PC starts recording within a few seconds', 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: on ? 'rgba(255,255,255,0.02)' : T.glass2, border: `1px solid ${on ? T.bd : T.bd2}`, borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? T.gr : T.tx3, flexShrink: 0 }} />Pack Cam {saving ? (on ? 'turning off…' : 'turning on…') : on ? 'on' : 'off'}
        </div>
        <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.5, marginTop: 2 }}>
          {on ? 'Every PackStation scan on a camera with an address gets a packing video.'
            : 'No packing videos are recorded. PackStation works as usual, without camera status or timer. You can still set up the PC and cameras below.'}
          {!isAdmin && ' Only an admin can switch it.'}
        </div>
      </div>
      {isAdmin && <div style={{ pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}><Toggle on={on} onToggle={flip} label="Pack Cam on or off" /></div>}
      <ConfirmModal {...modalProps} />
    </div>
  );
}

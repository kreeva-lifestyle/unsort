// The Play button on a PackStation history row: shows when Pack Cam has a
// saved video for that scan. One batched query per history page.
import { useEffect, useState } from 'react';
import { T, S } from '../../lib/theme';
import { logSwallowed } from '../../lib/errorLogger';
import { supabase } from '../../lib/supabase';
import type { PackcamClip } from '../../types/packcam';
import ClipPlayer from './ClipPlayer';

type ScanClip = Pick<PackcamClip, 'id' | 'scan_id' | 'awb' | 'camera' | 'scanned_at' | 'duration_s' | 'size_bytes' | 'status'>;

/** scan id → its clip, for the scans on screen (deleted / unfinished clips left out). */
export function useScanClips(scanIds: string[]) {
  const [clips, setClips] = useState<Record<string, ScanClip>>({});
  const key = scanIds.join(',');
  useEffect(() => {
    if (!key) { setClips({}); return; }
    let live = true;
    supabase.from('packcam_clips').select('id, scan_id, awb, camera, scanned_at, duration_s, size_bytes, status')
      .in('scan_id', key.split(',')).eq('status', 'done').is('delete_requested_at', null)
      .then(({ data, error }) => {
        // Videos are an extra on this page: a failed lookup only hides the Play buttons.
        if (error) { logSwallowed('packcam scan clips', error); return; }
        if (live) setClips(Object.fromEntries(((data || []) as ScanClip[]).map(c => [c.scan_id, c])));
      });
    return () => { live = false; };
  }, [key]);
  return clips;
}

export function ScanVideoButton({ clip }: { clip?: ScanClip }) {
  const [open, setOpen] = useState(false);
  if (!clip) return null;
  return (
    <>
      <button type="button" className="touch44" onClick={e => { e.stopPropagation(); setOpen(true); }} aria-label={`Play packing video for ${clip.awb}`} title="Packing video"
        style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, minWidth: 44, whiteSpace: 'nowrap', color: T.ac2 }}>▶ Video</button>
      {open && <ClipPlayer clip={clip} onClose={() => setOpen(false)} />}
    </>
  );
}

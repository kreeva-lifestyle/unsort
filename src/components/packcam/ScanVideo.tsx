// The packing video on a PackStation history row: a Play button when Pack Cam
// has a saved video for that scan, otherwise the reason there is none (tap
// for the full sentence). One batched query per history page.
import { useEffect, useRef, useState } from 'react';
import { T, S } from '../../lib/theme';
import { logSwallowed } from '../../lib/errorLogger';
import { supabase } from '../../lib/supabase';
import type { PackcamClip } from '../../types/packcam';
import ClipPlayer from './ClipPlayer';
import { playable } from '../settings/packcam/packcamApi';
import { loadNoVideoCtx, noVideoReason, type NoVideo } from './noVideo';

type ScanClip = Pick<PackcamClip, 'id' | 'scan_id' | 'awb' | 'camera' | 'scanned_at' | 'duration_s' | 'size_bytes' | 'status' | 'pc_path' | 'dropbox_path' | 'gdrive_link' | 'error'>;
export interface ScanVideoInfo { clip?: ScanClip; reason?: NoVideo }
type ScanRow = { id: string; scanned_at: string | null; camera: string };

/** scan id → its playable clip or why there is none, for the scans on screen. */
export function useScanClips(scans: ScanRow[]) {
  const [info, setInfo] = useState<Record<string, ScanVideoInfo>>({});
  const rows = useRef(scans);
  rows.current = scans;
  const key = scans.map(r => r.id).join(',');
  useEffect(() => {
    if (!key) { setInfo({}); return; }
    let live = true;
    Promise.all([
      supabase.from('packcam_clips').select('id, scan_id, awb, camera, scanned_at, duration_s, size_bytes, status, pc_path, dropbox_path, gdrive_link, error').in('scan_id', key.split(',')),
      // The reasons are a nicety: without them the Play buttons still show.
      loadNoVideoCtx().catch(e => { logSwallowed('packcam no-video reasons', e); return null; }),
    ]).then(([{ data, error }, ctx]) => {
      if (error) throw error;
      if (!live) return;
      const by = new Map(((data || []) as ScanClip[]).map(c => [c.scan_id, c]));
      const out: Record<string, ScanVideoInfo> = {};
      for (const r of rows.current) {
        const clip = by.get(r.id);
        if (clip && playable(clip)) out[r.id] = { clip };
        else if (ctx) { const reason = noVideoReason(r, clip, ctx); if (reason) out[r.id] = { reason }; }
      }
      setInfo(out);
      // Videos are an extra on this page: a failed lookup only hides the buttons.
    }).catch(e => logSwallowed('packcam scan clips', e));
    return () => { live = false; };
  }, [key]);
  return info;
}

export function ScanVideoButton({ v }: { v?: ScanVideoInfo }) {
  const [open, setOpen] = useState(false);
  if (!v) return null;
  if (!v.clip) {
    if (!v.reason) return null;
    return (
      <span style={{ display: 'inline-block', verticalAlign: 'middle', maxWidth: 220, whiteSpace: 'normal', textAlign: 'left' }}>
        <button type="button" onClick={e => { e.stopPropagation(); setOpen(o => !o); }} aria-expanded={open} title={v.reason.text}
          style={{ ...S.btnSm, minHeight: 32, background: 'none', border: `1px solid ${T.bd2}`, color: v.reason.tone === 'wait' ? T.yl : T.tx3, whiteSpace: 'nowrap', cursor: 'pointer' }}>
          No video · {v.reason.short}
        </button>
        {open && <span style={{ display: 'block', fontSize: 11, color: T.tx2, lineHeight: 1.4, marginTop: 4 }}>{v.reason.text}</span>}
      </span>
    );
  }
  const clip = v.clip;
  return (
    <>
      <button type="button" className="touch44" onClick={e => { e.stopPropagation(); setOpen(true); }} aria-label={`Play packing video for ${clip.awb}`} title="Packing video"
        style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, minWidth: 44, whiteSpace: 'nowrap', color: T.ac2 }}>▶ Video</button>
      {open && <ClipPlayer clip={clip} onClose={() => setOpen(false)} />}
    </>
  );
}

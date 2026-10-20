// Pack Cam → Videos: a tracking number with no video. Tells "never scanned"
// apart from "scanned, but…" (Pack Cam off, camera had no address, PC
// offline, camera not recording, upload failed) — newest 5 scans of it.
import { useEffect, useState } from 'react';
import { T } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { supabase } from '../../../lib/supabase';
import Empty from '../../ui/Empty';
import type { PackcamClip } from '../../../types/packcam';
import { loadNoVideoCtx, noVideoReason, type ClipLike, type NoVideo } from '../../packcam/noVideo';
import { playable } from './packcamApi';

type Found = { id: string; awb: string; camera: string; scanned_at: string | null; received_at: string | null; reason: NoVideo | null; hasVideo: boolean };
const WAIT_MS = 400;   // typing: look up once the tracking number is complete

export default function NoVideoLookup({ awb, filtered }: { awb: string; filtered: boolean }) {
  const [found, setFound] = useState<Found[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    setFound(null); setErr('');
    const t = setTimeout(() => (async () => {
      // The exact tracking number (as typed or in capitals): served by the awb index.
      const { data, error } = await supabase.from('packtime_scans').select('id, awb, camera, scanned_at, received_at')
        .in('awb', [...new Set([awb, awb.toUpperCase()])]).order('scanned_at', { ascending: false }).limit(5);
      if (error) throw error;
      const scans = (data || []) as { id: string; awb: string; camera: string; scanned_at: string | null; received_at: string | null }[];
      if (!scans.length) return [];
      const [clips, ctx] = await Promise.all([
        supabase.from('packcam_clips').select('scan_id, status, error, pc_path, dropbox_path, gdrive_link').in('scan_id', scans.map(s => s.id)),
        loadNoVideoCtx(),
      ]);
      if (clips.error) throw clips.error;
      const by = new Map(((clips.data || []) as (ClipLike & Pick<PackcamClip, 'scan_id'>)[]).map(c => [c.scan_id, c]));
      return scans.map(s => {
        const clip = by.get(s.id);
        return { ...s, hasVideo: !!clip && playable(clip), reason: noVideoReason(s, clip, ctx) };
      });
    })().then(r => { if (live) setFound(r); }).catch(e => { if (live) setErr(friendlyError(e)); }), WAIT_MS);
    return () => { live = false; clearTimeout(t); };
  }, [awb]);

  if (err) return <Empty icon="warning" title="Could not check this tracking number" message={err} />;
  if (!found) return <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Checking why there is no video…</div>;
  if (!found.length) return <Empty icon="search" title="Never scanned" message={`Tracking number "${awb}" was never scanned in PackStation, so there is no packing video. Check the number — the full tracking number is needed here.`} />;
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora, marginBottom: 8 }}>Scanned, but no video{filtered ? ' with these filters' : ''}</div>
      {found.map(s => (
        <div key={s.id} style={{ padding: '8px 0', borderTop: `1px solid ${T.bd}`, fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ fontFamily: T.mono, fontWeight: 600, color: T.tx }}>{s.awb}</div>
          <div style={{ color: T.tx3, fontSize: 11 }}>Camera {s.camera}{s.scanned_at ? ` · ${new Date(s.scanned_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</div>
          <div style={{ color: s.hasVideo ? T.gr : s.reason?.tone === 'wait' ? T.yl : T.tx2, marginTop: 2 }}>
            {s.hasVideo ? 'A video exists — clear the date, camera or status filters to see it.' : s.reason ? s.reason.text : 'No video — this scan is from before Pack Cam was set up.'}
          </div>
        </div>
      ))}
    </div>
  );
}

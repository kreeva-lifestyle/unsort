// In-app photo viewer (mobile.md §10: a photo opens in-app, never in a new
// tab). Built on PbModal, so it is a bottom sheet on phone and a centred
// modal on desktop, with the dialog role, Tab trap, device Back and the 44px
// close. "Previous" / "Next" are real buttons in the footer (never swipe-only).
// With `edit` (the product page) the photo can be made the main one, moved to
// any position or removed, right under it: the first photo is the main image
// on every website. Removing asks first (the page's confirm); a move saves at
// once. The viewer follows the photo it shows: after a move it stays on that
// photo, after a removal it shows the one that took its place.
import { useEffect, useId, useState } from 'react';
import { pbPhotoUrl, photoFallback } from '../../../data/pbFunctions';
import type { ProductDetail } from '../../../data/products';
import { PB, pbInput, pbLabel, pbMeta } from '../../../pbTheme';
import PbButton from '../../ui/PbButton';
import PbModal from '../PbModal';

type Img = ProductDetail['pb_product_images'][number];
/** `busy`: 'main' | 'move' | 'remove' while that change is being saved (any other text = the page is busy elsewhere). */
export type PhotoEdit = { busy: string | null; move: (photoId: string, to: number, main: boolean) => void; remove: (photoId: string) => void };

export function PhotoViewer({ photos, index, onIndex, onClose, edit }: { photos: Img[]; index: number; onIndex: (i: number) => void; onClose: () => void; edit?: PhotoEdit }) {
  const posId = useId();
  const [want, setWant] = useState(index); // the position just chosen, shown while it is being saved
  const img = photos[index];
  if (!img) return null;
  const many = photos.length > 1, busy = edit?.busy ?? null, dim = !!busy;
  return (
    <PbModal open title={`Photo ${index + 1} of ${photos.length}`} onClose={onClose} width={720}
      footer={many ? (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'space-between' }}>
          <PbButton icon="chevronLeft" onClick={() => onIndex(index - 1)} disabled={index === 0} style={{ flex: '1 1 0' }}>Previous</PbButton>
          <PbButton onClick={() => onIndex(index + 1)} disabled={index === photos.length - 1} style={{ flex: '1 1 0' }}>Next</PbButton>
        </div>
      ) : undefined}>
      {/* Whole photo, sized for a phone screen (about 1440 × 1800 px); the original only if resizing fails.
          With the edit controls below, it is kept short enough for them to show without scrolling. */}
      <img key={img.id} src={pbPhotoUrl(img.path, 720, 900)} alt={`Photo ${index + 1}`} decoding="async" onError={photoFallback(img.path)}
        style={{ display: 'block', width: '100%', maxHeight: edit ? 'max(220px, min(70dvh, 90dvh - 360px))' : '70dvh', objectFit: 'contain', borderRadius: PB.r.photo, background: PB.ctl }} />
      {edit && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {index > 0 && (
              <PbButton busy={busy === 'main'} busyLabel="Saving…" dim={dim && busy !== 'main'} onClick={() => edit.move(img.id, 0, true)} style={{ flex: '1 1 auto' }}>
                Make main photo
              </PbButton>
            )}
            {/* No icons, and sized by their words: both labels must show in full side by side on a 360px phone. */}
            <PbButton kind="danger" busy={busy === 'remove'} busyLabel="Removing…" dim={dim && busy !== 'remove'} onClick={() => edit.remove(img.id)} style={{ flex: '1 1 auto' }}>
              Remove photo
            </PbButton>
          </div>
          {many && (
            <div style={{ minWidth: 0 }}>
              <label htmlFor={posId} style={pbLabel}>Position</label>
              <select id={posId} className="pb-input" value={busy === 'move' ? want : index} disabled={dim} aria-describedby={`${posId}-hint`} aria-busy={busy === 'move' || undefined}
                onChange={e => { const to = Number(e.target.value); if (to !== index) { setWant(to); edit.move(img.id, to, false); } }}
                style={{ ...pbInput, ...(dim ? { opacity: 0.5 } : null) }}>
                {photos.map((x, i) => <option key={x.id} value={i}>{i === 0 ? '1 · main photo' : i + 1}</option>)}
              </select>
              <p id={`${posId}-hint`} style={{ ...pbMeta, margin: '8px 0 0' }}>
                {busy === 'move' ? 'Moving…' : 'Position 1 is the main photo on every website.'}
              </p>
            </div>
          )}
        </div>
      )}
    </PbModal>
  );
}

/** Keeps which photo is open; `node` renders the viewer (null while closed). */
export function usePhotoViewer(photos: Img[], edit?: PhotoEdit) {
  const [at, setAt] = useState<{ id: string; i: number } | null>(null);
  const found = at ? photos.findIndex(p => p.id === at.id) : -1;
  // The photo moved → follow it. It was removed → the one that took its place; none left → closed.
  const index = !at ? null : found >= 0 ? found : photos.length ? Math.min(at.i, photos.length - 1) : null;
  useEffect(() => {
    if (!at) return;
    if (index === null) setAt(null);
    else if (photos[index].id !== at.id || index !== at.i) setAt({ id: photos[index].id, i: index });
  }, [at, index, photos]);
  const go = (i: number) => { if (photos[i]) setAt({ id: photos[i].id, i }); };
  const node = index === null ? null : <PhotoViewer photos={photos} index={index} onIndex={go} onClose={() => setAt(null)} edit={edit} />;
  return { open: go, node };
}

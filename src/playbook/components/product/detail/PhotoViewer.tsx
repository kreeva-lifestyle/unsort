// In-app photo viewer (mobile.md §10: a photo opens in-app, never in a new
// tab). Built on PbModal, so it is a bottom sheet on phone and a centred
// modal on desktop, with the dialog role, Tab trap, device Back and the 44px
// close. "Previous" / "Next" are real buttons in the footer (never swipe-only).
import { useState } from 'react';
import { pbPhotoUrl, photoFallback } from '../../../data/pbFunctions';
import type { ProductDetail } from '../../../data/products';
import { PB } from '../../../pbTheme';
import PbButton from '../../ui/PbButton';
import PbModal from '../PbModal';

type Img = ProductDetail['pb_product_images'][number];

export function PhotoViewer({ photos, index, onIndex, onClose }: { photos: Img[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const img = photos[index];
  if (!img) return null;
  const many = photos.length > 1;
  return (
    <PbModal open title={`Photo ${index + 1} of ${photos.length}`} onClose={onClose} width={720}
      footer={many ? (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'space-between' }}>
          <PbButton icon="chevronLeft" onClick={() => onIndex(index - 1)} disabled={index === 0} style={{ flex: '1 1 0' }}>Previous</PbButton>
          <PbButton onClick={() => onIndex(index + 1)} disabled={index === photos.length - 1} style={{ flex: '1 1 0' }}>Next</PbButton>
        </div>
      ) : undefined}>
      {/* Whole photo, sized for a phone screen (about 1440 × 1800 px); the original only if resizing fails. */}
      <img key={img.id} src={pbPhotoUrl(img.path, 720, 900)} alt={`Photo ${index + 1}`} decoding="async" onError={photoFallback(img.path)}
        style={{ display: 'block', width: '100%', maxHeight: '70dvh', objectFit: 'contain', borderRadius: PB.r.photo, background: PB.ctl }} />
    </PbModal>
  );
}

/** Keeps which photo is open; `node` renders the viewer (null while closed). */
export function usePhotoViewer(photos: Img[]) {
  const [index, setIndex] = useState<number | null>(null);
  const node = index === null ? null : <PhotoViewer photos={photos} index={index} onIndex={setIndex} onClose={() => setIndex(null)} />;
  return { open: setIndex, node };
}

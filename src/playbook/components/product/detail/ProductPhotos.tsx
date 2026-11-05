// Product photos. Desktop: an 8×2 bento tile, the cover tall (4:5, garments
// are portrait) with the rest and the "Add photos" cell in a grid beside it. Phone: the photo hero at the top of
// the page, a sideways snap strip with the back button laid over it.
// Each photo opens full size (as before); uploads go through the page.
import type { CSSProperties, ReactNode } from 'react';
import { pbImageUrl } from '../../../data/pbFunctions';
import type { ProductDetail } from '../../../data/products';
import { PB, pbMeta, pbTileFlat, pbTileTitle } from '../../../pbTheme';
import PbIcon from '../../ui/PbIcon';
import PbTile from '../../ui/PbTile';
import { PbBackButton } from '../../ui/PbPageHeader';

type Img = ProductDetail['pb_product_images'][number];
type AddProps = { onAdd: () => void; busy: string | null };

const photoLink = (img: Img, i: number, box: CSSProperties) => (
  <a key={img.id} href={pbImageUrl(img.path)} target="_blank" rel="noreferrer" className="pb-tile" aria-label={`Open photo ${i + 1} full size`}
    style={{ display: 'block', flexShrink: 0, borderRadius: PB.r.photo, overflow: 'hidden', background: PB.tile, border: `1px solid ${PB.tileBd}`, ...box }}>
    <img src={pbImageUrl(img.path)} alt={`Photo ${i + 1}`} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  </a>
);

/** Dashed "Add photos" cell: two signals while uploading. */
function AddCell({ onAdd, busy, style }: AddProps & { style?: CSSProperties }) {
  const mine = busy === 'photos';
  return (
    <button type="button" onClick={onAdd} className="pb-pill" aria-busy={mine || undefined}
      style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
        borderRadius: PB.r.photo, border: `1px dashed ${PB.inputBd}`, background: PB.ctl, color: PB.tx, font: `600 13px/1.3 ${PB.sans}`,
        minHeight: 44, minWidth: 44, ...(busy ? { opacity: 0.5, pointerEvents: 'none' } : null), ...style }}>
      <PbIcon name={mine ? 'refresh' : 'plus'} size={20} />
      {mine ? 'Uploading…' : 'Add photos'}
    </button>
  );
}

function NoPhotos({ children }: { children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: PB.tx2, textAlign: 'center', padding: 16 }}>
      <PbIcon name="photo" size={28} />
      <span style={{ fontSize: 13 }}>No photos yet</span>
      {children}
    </div>
  );
}

export function PhotosTile({ images, onAdd, busy }: AddProps & { images: Img[] }) {
  const [cover, ...rest] = images;
  return (
    <PbTile as="section" span={8} rows={2} aria-labelledby="pb-photos-title" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 id="pb-photos-title" style={pbTileTitle}>Photos</h2>
        <span style={pbMeta}>{images.length === 1 ? '1 photo' : `${images.length} photos`}</span>
      </div>
      {!cover ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240, borderRadius: PB.r.photo, background: PB.ctl }}>
          <NoPhotos><AddCell onAdd={onAdd} busy={busy} style={{ padding: '8px 16px', flexDirection: 'row' }} /></NoPhotos>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
          {photoLink(cover, 0, { height: 'clamp(280px, 30vw, 400px)', aspectRatio: '4 / 5', flex: 'none' })}
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8, alignContent: 'start' }}>
            {rest.map((img, i) => photoLink(img, i + 1, { width: '100%', aspectRatio: '4 / 5' }))}
            <AddCell onAdd={onAdd} busy={busy} style={{ width: '100%', aspectRatio: '4 / 5', minHeight: 90, padding: 4, textAlign: 'center', fontSize: 12 }} />
          </div>
        </div>
      )}
    </PbTile>
  );
}

export function PhonePhotoHero({ images, onAdd, busy, onBack }: AddProps & { images: Img[]; onBack: () => void }) {
  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <div style={{ ...pbTileFlat, padding: 0, overflow: 'hidden', borderRadius: 'var(--pb-r-hero)' }}>
        {images.length === 0 ? (
          <div style={{ minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 44 }}>
            <NoPhotos><AddCell onAdd={onAdd} busy={busy} style={{ padding: '8px 16px', flexDirection: 'row' }} /></NoPhotos>
          </div>
        ) : (
          <div className="pb-chiprow" style={{ margin: 0, padding: 8, gap: 8, scrollPaddingLeft: 8 }}>
            {images.map((img, i) => (
              <div key={img.id} style={{ flex: images.length === 1 ? '0 0 calc(100% - 104px)' : '0 0 82%', aspectRatio: '4 / 5', scrollSnapAlign: 'start', display: 'flex' }}>
                {photoLink(img, i, { flex: 1 })}
              </div>
            ))}
            <AddCell onAdd={onAdd} busy={busy} style={{ flex: '0 0 96px', alignSelf: 'stretch', scrollSnapAlign: 'end', padding: 8, textAlign: 'center' }} />
          </div>
        )}
      </div>
      <div style={{ position: 'absolute', top: 16, left: 16, borderRadius: PB.r.input, background: PB.sheet }}>
        <PbBackButton label="Products" onBack={onBack} />
      </div>
      {images.length > 0 && (
        <span style={{ position: 'absolute', bottom: 16, left: 16, padding: '4px 12px', borderRadius: PB.r.pill, background: PB.sheet, border: `1px solid ${PB.tileBd}`, fontSize: 12, color: PB.tx, fontWeight: 600 }}>
          {images.length === 1 ? '1 photo' : `${images.length} photos`}
        </span>
      )}
    </div>
  );
}

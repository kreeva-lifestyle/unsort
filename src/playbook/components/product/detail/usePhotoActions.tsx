// The product page's photo jobs: add (file picker → upload), make main / move
// to a position, remove (asks first: the file is deleted for good). Each runs
// through the page's one-busy-key `act`, so the page's other buttons wait.
// After any of them the websites follow (data/photos.ts): a published listing
// is sent to Shopify again with the photos the product has now.
import { useRef, type ReactNode } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import type { ConfirmOptions } from '../../../../components/ui/ConfirmModal';
import type { AddToast } from '../../PbToasts';
import { movedTo, photoTail, setPhotos, syncPhotos, type PhotoReply } from '../../../data/photos';
import { addPhotos, checkPhoto, type ProductDetail } from '../../../data/products';
import { refreshGate } from '../../../data/tags';
import type { PhotoEdit } from './PhotoViewer';
import { splitMedia } from './ProductVideos';

type Act = (key: string, fn: () => Promise<unknown>, done: string | ((r: unknown) => string)) => Promise<void>;
type O = { busy: string | null; act: Act; ask: (o: ConfirmOptions) => Promise<boolean>; addToast: AddToast };
const KEYS = ['main', 'move', 'remove'];

export function usePhotoActions(p: ProductDetail | null, { busy, act, ask, addToast }: O): { addPhoto: () => void; edit: PhotoEdit | undefined; input: ReactNode } {
  const file = useRef<HTMLInputElement>(null);
  const photos = p ? splitMedia(p.pb_product_images).photos : [];
  const ids = photos.map(x => x.id);

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (file.current) file.current.value = '';
    const bad = files.map(checkPhoto).filter(Boolean);
    if (bad.length) { addToast(bad.join(' · '), 'error'); return; }
    if (!files.length || !p) return;
    const next = p.pb_product_images.reduce((m, i) => Math.max(m, i.position + 1), 0);
    const added = files.length === 1 ? 'Photo added' : `${files.length} photos added`;
    // A product held only for its photo becomes Ready here (the gate), and the automation sends it to the websites.
    const quiet: PhotoReply = { status: p.status, resent: 0, review: 0, reread: false };
    void act('photos', async () => {
      await addPhotos(p.id, files, next);
      await refreshGate(p.id);
      // The photos are in. A website the product is on (or going out to right now) is told in a second step:
      // its failure is a warning, not "not added".
      if (!p.pb_listings.some(l => l.status === 'published' || l.status === 'publishing')) return quiet;
      return syncPhotos(p.id).catch(e => ({ ...quiet, warning: `the websites could not be told (${friendlyError(e)}). Tap Check websites again` }));
    }, r => `${added}${photoTail(r as PhotoReply, 1)}`);
  };

  const edit: PhotoEdit | undefined = p ? {
    busy: busy && !KEYS.includes(busy) ? 'other' : busy,
    move: (id, to, main) => void act(main ? 'main' : 'move', () => setPhotos(p.id, movedTo(ids, id, to)),
      r => `${to === 0 ? 'Main photo changed' : `Photo moved to position ${to + 1}`}${photoTail(r as PhotoReply, ids.length)}`),
    remove: async (id) => {
      const live = p.pb_listings.filter(l => l.status === 'published').length;
      const message = ['It is deleted from Playbook and cannot be brought back.',
        live ? `It is also taken off the ${live === 1 ? 'website' : `${live} websites`} this product is published on.` : '',
        ids.length === 1 ? 'This is the only photo: the product then waits in Needs info until you add one.' : ''].filter(Boolean).join(' ');
      if (!await ask({ title: 'Remove this photo?', message, confirmLabel: 'Remove photo', danger: true })) return;
      await act('remove', () => setPhotos(p.id, ids.filter(x => x !== id), [id]), r => `Photo removed${photoTail(r as PhotoReply, ids.length - 1)}`);
    },
  } : undefined;

  return {
    addPhoto: () => file.current?.click(), edit,
    input: <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => pick(e.target.files)} />,
  };
}

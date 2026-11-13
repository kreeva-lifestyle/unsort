// A product's photos once they are in: another order, one removed, and the
// websites told (pb-products photos_set / photos_sync → photosEdit.ts).
// Adding is in products.ts (addPhotos: the files go up from the app).
import { pbCall } from './pbFunctions';

/** `resent`: published listings on their way to Shopify again; `review`: the ones that wait for approval first;
 *  `reread`: the AI had given up on a photo and reads the product again. */
export type PhotoReply = { removed?: number; status: string; resent: number; review: number; reread: boolean; warning?: string };

/** Keep `order` (first = main photo) and delete `remove` for good. A photo in neither list stays, after the others. */
export const setPhotos = (productId: string, order: string[], remove: string[] = []) =>
  pbCall<PhotoReply>('photos_set', { product_id: productId, order, remove });

/** After photos were added: the websites this product is published on get them too. */
export const syncPhotos = (productId: string) => pbCall<PhotoReply>('photos_sync', { product_id: productId });

/** `ids` with `id` moved to position `to` (0 = main photo). */
export function movedTo(ids: string[], id: string, to: number): string[] {
  const rest = ids.filter(x => x !== id);
  rest.splice(Math.max(0, Math.min(to, rest.length)), 0, id);
  return rest;
}

/** What the change set going, to end a toast with: " — 2 published listings sent to Shopify again". */
export function photoTail(r: PhotoReply, left: number): string {
  const n = (k: number, one: string, many: string) => `${k} published listing${k === 1 ? ` ${one}` : `s ${many}`}`;
  const parts = [
    r.resent ? `${n(r.resent, 'is', 'are')} being sent to Shopify again` : '',
    r.review ? n(r.review, 'waits for approval before its website changes', 'wait for approval before their websites change') : '',
    r.reread ? 'the AI reads the product again' : '',
    !left ? 'the product needs a photo before it can go to websites' : '',
  ].filter(Boolean);
  return parts.length ? ` — ${parts.join(', ')}` : '';
}

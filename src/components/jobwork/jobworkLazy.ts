// The Jobwork sheets and pages loaded on demand: the list is what someone
// opens the page for, so the job page, the job form, Share pending and
// Received on are fetched when first needed — and quietly in the background
// once the list is on screen (prefetchJobworkParts). Render inside <Suspense>.
import { lazy } from 'react';

const load = {
  detail: () => import('./JobDetailView'),
  form: () => import('./JobForm'),
  share: () => import('./PendingShareModal'),
  received: () => import('./ReceivedByDate'),
};
export const JobDetailView = lazy(load.detail);
export const JobForm = lazy(load.form);
export const PendingShareModal = lazy(load.share);
export const ReceivedByDate = lazy(load.received);

let started = false;
/** Fetch every part's code once; a failure only means it loads on first use. */
export function prefetchJobworkParts() {
  if (started) return;
  started = true;
  for (const f of Object.values(load)) f().catch(() => { started = false; });
}

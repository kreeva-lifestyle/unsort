// The Purchase Orders sheets and pages loaded on demand: the list is what
// someone opens the page for, so the form, detail, receive, challan, print, pendency
// and contacts code is fetched when first needed — and quietly in the
// background once the list is on screen (prefetchPoParts), so a tap is
// still instant. Render each inside <Suspense>.
import { lazy } from 'react';

const load = {
  form: () => import('./POForm'),
  detail: () => import('./PODetail'),
  receive: () => import('./POReceive'),
  challan: () => import('./POReceiveChallan'),
  print: () => import('./POPrintOverlay'),
  pendency: () => import('./PendencyReport'),
  contacts: () => import('../contacts/Contacts'),
};
export const POForm = lazy(load.form);
export const PODetail = lazy(load.detail);
export const POReceive = lazy(load.receive);
export const POReceiveChallan = lazy(load.challan);
export const POPrintOverlay = lazy(load.print);
export const PendencyReport = lazy(load.pendency);
export const Contacts = lazy(load.contacts);

let started = false;
/** Fetch every part's code once; a failure only means it loads on first use. */
export function prefetchPoParts() {
  if (started) return;
  started = true;
  for (const f of Object.values(load)) f().catch(() => { started = false; });
}

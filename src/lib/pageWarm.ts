// Start loading a page's code the moment a finger lands on (or a mouse
// hovers) its menu item: by the time the tap finishes, the code is on its way
// instead of only starting then. The same import() the app's lazy pages use,
// so the browser fetches the file once. Only the heavier pages are listed.
const PAGES: Record<string, () => Promise<unknown>> = {
  purchaseorders: () => import('../pages/PurchaseOrders'),
  jobwork: () => import('../pages/Jobwork'),
};
const warmed = new Set<string>();
export function warmPage(tab: string) {
  const load = PAGES[tab];
  if (!load || warmed.has(tab)) return;
  warmed.add(tab);
  load().catch(() => warmed.delete(tab));   // a failed warm-up just loads on the tap
}

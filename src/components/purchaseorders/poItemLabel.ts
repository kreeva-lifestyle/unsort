// One way to print a PO line everywhere it is shown — detail, receive,
// close, receipts, list, PDF, image, pendency and the pricing evidence.
// Fabric items carry the fabric code as its own column now (it used to be
// typed into the name as "micro - 321"), so the display puts it back next
// to the name: "micro · 321". Non-fabric items are just the name.
export const itemLabel = (it: { item_name: string; fabric_code?: string | null }): string => {
  const code = (it.fabric_code || '').trim();
  return code ? `${it.item_name} · ${code}` : it.item_name;
};

/** Under a line's label, for us only: the design and what the fabric is for — "DRS230 · for DUPATTA" (either part may be missing). */
export const lineNote = (it: { sku?: string | null; component?: string | null }): string => {
  const part = (it.component || '').trim();
  return [(it.sku || '').trim(), part && `for ${part}`].filter(Boolean).join(' · ');
};

// The product's own actions: Read again with AI, Check websites again (Ready
// only), Archive / Restore, and Delete (admin / manager only: `onDelete` is
// passed only to them). Desktop: in the page header. Phone: a tile at the
// end of the page (destructive at the end, away from the one gradient; Delete
// last, after Archive, because it cannot be undone).
// None is the gradient: on this page that is Approve & publish or Save facts.
import type { ProductDetail } from '../../../data/products';
import { pbTileTitle } from '../../../pbTheme';
import PbButton from '../../ui/PbButton';
import PbTile from '../../ui/PbTile';

export default function ProductActions({ p, busy, onRead, onRoute, onRestore, onArchive, onDelete, block }: {
  p: ProductDetail; busy: string | null; onRead: () => void; onRoute: () => void; onRestore: () => void; onArchive: () => void;
  /** Delete for good (asks first). Left out for people who may not delete. */
  onDelete?: () => void;
  /** Phone: full-width buttons stacked. */
  block?: boolean;
}) {
  const b = (key: string) => ({ busy: busy === key, dim: !!busy && busy !== key, block });
  return (
    <>
      <PbButton {...b('read')} icon="refresh" busyLabel="Reading…" onClick={onRead}>Read again with AI</PbButton>
      {p.status === 'ready' && <PbButton {...b('route')} busyLabel="Checking…" onClick={onRoute}>Check websites again</PbButton>}
      {p.status === 'archived'
        ? <PbButton {...b('restore')} busyLabel="Restoring…" onClick={onRestore}>Restore</PbButton>
        : <PbButton kind="danger" {...b('archive')} busyLabel="Archiving…" onClick={onArchive} style={block ? { marginTop: 16 } : undefined}>Archive</PbButton>}
      {/* Desktop header: icon only, so a fourth button does not squeeze the product's name. Phone: the word. */}
      {onDelete && (block
        ? <PbButton kind="danger" {...b('delete')} icon="trash" busyLabel="Deleting…" onClick={onDelete}>Delete</PbButton>
        : <PbButton kind="danger" {...b('delete')} icon="trash" iconOnly aria-label="Delete this product" title="Delete this product" onClick={onDelete} />)}
    </>
  );
}

/** Phone: the actions as the last tile of the page. */
export function PhoneActionsTile(props: Parameters<typeof ProductActions>[0]) {
  return (
    <PbTile as="section" aria-labelledby="pb-pactions-title" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 id="pb-pactions-title" style={{ ...pbTileTitle, marginBottom: 4 }}>More actions</h2>
      <ProductActions {...props} block />
    </PbTile>
  );
}

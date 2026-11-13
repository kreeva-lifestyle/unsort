// "Move its products to…" (owner, 13 Nov 2026: "If deleted than it has to be moved to correct category and let ai
// decide which product type is it for that category"). Shown in the category sheet when removing a category that has
// products, and for a category no longer on the list that still has products (CategoriesTile). The server moves them,
// takes the old name off the list when `remove`, and queues "Let AI decide" for the ones missing a tag the new category
// needs (Product Type…): the word rules first, then the AI. Settings → Bulk changes moves them back for 7 days.
// The box's one gradient: Move. `onRemoveOnly`: removing without moving (they wait with "Missing: Category").
import { useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { TagsApi } from '../../data/tags';
import { catKey } from '../../tagTypes';
import { PB, pbBody, pbInput, pbTileReview } from '../../pbTheme';
import { PbButton } from '../ui';
import { Dot } from '../product/status';
import { plural } from './tagText';

export default function CategoryMoveBox({ from, count, categories, remove, api, addToast, onDone, onRemoveOnly, onCancel }: {
  from: string; count: number; categories: string[]; remove: boolean; api: TagsApi; addToast: AddToast;
  onDone: () => void; onRemoveOnly?: () => Promise<void>; onCancel?: () => void;
}) {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<'' | 'move' | 'only'>('');
  const options = categories.filter(c => catKey(c) !== catKey(from));
  const id = `pbc-move-${catKey(from).replace(/\s+/g, '-')}`;
  const move = async () => {
    if (!to || busy) return;
    setBusy('move');
    try {
      const r = await api.moveCategory(from, to, remove);
      addToast([`Moved ${plural(r.moved, 'product')} to ${to}`, r.to_ready ? `${r.to_ready} ready` : '', r.queued ? `AI is choosing the missing tags for ${plural(r.queued, 'product')}` : '',
        r.removed ? `${from} removed from the list` : ''].filter(Boolean).join(' · '), 'success');
      onDone();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(''); }
  };
  const only = async () => { if (!onRemoveOnly || busy) return; setBusy('only'); try { await onRemoveOnly(); } finally { setBusy(''); } };
  return (
    <div role="group" aria-labelledby={`${id}-t`} style={{ ...pbTileReview, backdropFilter: 'none', WebkitBackdropFilter: 'none', borderRadius: PB.r.input, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <Dot color={PB.review} label={<span id={`${id}-t`}>{plural(count, 'product')} {count === 1 ? 'is' : 'are'} filed under {from}</span>} style={{ color: PB.tx, fontWeight: 600, fontSize: 13, whiteSpace: 'normal' }} />
      <span style={pbBody}>
        Move them to another category. There the word rules, then the AI, choose the tags that category needs and they lack (Product Type…).
        {remove ? ` Then ${from} leaves the list.` : ''} Settings → Bulk changes can move them back for 7 days.
      </span>
      <label htmlFor={id} className="pb-sr">Move them to</label>
      <select id={id} value={to} onChange={e => setTo(e.target.value)} disabled={!!busy} className="pb-input" style={{ ...pbInput, minWidth: 0 }}>
        <option value="">— Move them to… —</option>
        {options.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <PbButton kind="primary" icon="sparkles" onClick={() => void move()} disabled={!to} busy={busy === 'move'} busyLabel="Moving…" dim={busy === 'only'}>
          {to ? `Move to ${to}` : 'Move them'}
        </PbButton>
        {onRemoveOnly && <PbButton kind="danger" onClick={() => void only()} busy={busy === 'only'} busyLabel="Removing…" dim={busy === 'move'}>Remove without moving</PbButton>}
        {onCancel && <PbButton onClick={onCancel} dim={!!busy}>Cancel</PbButton>}
      </div>
      {onRemoveOnly && <span style={{ ...pbBody, color: PB.tx2 }}>Without moving, they wait in Needs info with “Missing: Category” until each gets a category.</span>}
    </div>
  );
}

// One busy key per tile for the tag actions (keep / hide / unhide / merge /
// rename / kind): the row's button says what it is doing, the others grey
// out, then a toast repeats what happened (two-signal rule) and the page is
// told to reload. Errors go through friendlyError.
import { useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { TagsApi } from '../../data/tags';
import type { PbTagAction, PbTagKind } from '../../tagTypes';
import { actDone } from './tagText';
import type { TagEdit } from './TagEditModal';

export type RowBusy = '' | 'keep' | 'hide' | 'other';

export function useTagActions(api: TagsApi, addToast: AddToast, onChanged: () => void) {
  /** "<id>:<action>" while one runs, the caller's own key (`as`: 'bulk:hide', 'codes') for a selection, '' when idle. */
  const [busy, setBusy] = useState('');
  const rowBusy = (id: string): RowBusy => {
    if (!busy) return '';
    const [bid, act] = busy.split(':');
    if (bid !== id) return 'other';
    return act === 'keep' ? 'keep' : act === 'hide' || act === 'unhide' ? 'hide' : 'other';
  };
  const run = async (ids: string[], action: PbTagAction, extra: { into?: string; name?: string; kind?: PbTagKind; intoName?: string } = {}, as?: string) => {
    if (busy || !ids.length) return false;
    setBusy(as ?? (ids.length === 1 ? `${ids[0]}:${action}` : 'bulk'));
    try {
      const r = await api.act(ids, action, { into: extra.into, name: extra.name, kind: extra.kind });
      addToast(actDone(action, r.done, extra.intoName), 'success');
      onChanged();
      return true;
    } catch (e) { addToast(friendlyError(e), 'error'); return false; } finally { setBusy(''); }
  };
  /** The Edit sheet's result: a merge, else a rename and / or a kind change. */
  const edit = async (ids: string[], e: TagEdit) => {
    if (e.into) return run(ids, 'merge', { into: e.into.id, intoName: e.into.name });
    let ok = true;
    if (e.name !== undefined && ids.length === 1) ok = await run(ids, 'rename', { name: e.name });
    if (ok && e.kind !== undefined) ok = await run(ids, 'kind', { kind: e.kind });
    return ok;
  };
  return { busy, rowBusy, run, edit };
}

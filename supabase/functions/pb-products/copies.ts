// "Archive the copies" (pre-launch fix D18): the products the Ready gate holds
// as copies of ones added earlier, archived in one go instead of one tap each.
//   copies_archive {} → { ok, archived, priced, on_site, linked, run_id }
// The database does it (pb_copies_archive, 20261113120000_pb_copies.sql): every
// copy is judged once, as things stand before anything is archived, so it does
// exactly what the app showed beforehand (the app asks the same function with
// apply = false). A copy with something of its own is left for a person and
// counted —
//   on_site  a listing of it is already on a store;
//   priced   it came with a vendor price the earlier product lacks, or a
//            different one (a changed rate would be lost with the copy);
//   linked   it is part of a chain of copies (it copies a waiting copy, or a
//            waiting copy points at it): archived together, the only product
//            of a colour could go.
// Notes that no longer hold are cleared by the same call.
// Nothing is let go to the websites by it. It is a bulk change: the log keeps
// every product it archived, and "Revert" (Settings → Bulk changes) puts them
// back in Needs info for 7 days. No answer is stored for the pairs, so a
// revert leaves nothing behind.
import { endRun, startRun } from './bulkLog.ts';
import { logActivity, rpc } from './db.ts';

export interface CopyCounts { archived: number; priced: number; on_site: number; linked: number }
const counts = (r: Partial<CopyCounts> | null | undefined): CopyCounts => ({ archived: Number(r?.archived) || 0, priced: Number(r?.priced) || 0, on_site: Number(r?.on_site) || 0, linked: Number(r?.linked) || 0 });

export async function copiesArchive(userId: string | null) {
  const run = await startRun('copies', 'Archived the products waiting as copies', { userId });
  let done = counts(null);
  try {
    done = counts(await rpc<CopyCounts>('pb_copies_archive', { p_apply: true, p_user: userId }, run));
  } finally { await endRun(run, { ...done }); } // a change that touched nothing leaves the log again
  if (done.archived) await logActivity({ action: 'copies_archived', details: { ...done, run_id: run }, user_id: userId });
  return { ok: true, ...done, run_id: done.archived ? run : null };
}

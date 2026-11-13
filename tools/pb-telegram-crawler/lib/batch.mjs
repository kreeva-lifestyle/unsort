// Pure planning: which channel messages are forwarded together, and where
// the cursor (last_id = newest message already handled) moves. No I/O.
//
// A message here is { id, groupedId: string|null, service: boolean, date },
// as lib/telegram.mjs hands it over (date: unix seconds the vendor posted it,
// or null). A unit keeps its messages' dates beside their ids (`dates`).

// Splits one page of messages (oldest first) into units:
//   { ids: [..], lastId, album: true }   an album: same groupedId, one call
//   { ids: [id], lastId }                one single message
//   { skip: true, lastId }               service message (joined, pinned…)
// When the page was full (more may follow) and it ends in an album, that
// album is held back so the next page starts with it whole: Telegram only
// keeps an album together when all its parts go in one forward.
export function planBatches(messages, pageSize) {
  const sorted = [...messages].sort((a, b) => a.id - b.id);
  const units = [];
  for (const m of sorted) {
    if (m.service) { units.push({ skip: true, lastId: m.id }); continue; }
    const prev = units[units.length - 1];
    if (m.groupedId && prev?.album && prev.groupedId === m.groupedId) {
      prev.ids.push(m.id);
      prev.dates.push(m.date ?? null);
      prev.lastId = m.id;
      continue;
    }
    units.push(m.groupedId
      ? { ids: [m.id], dates: [m.date ?? null], lastId: m.id, album: true, groupedId: m.groupedId }
      : { ids: [m.id], dates: [m.date ?? null], lastId: m.id });
  }
  const full = sorted.length >= pageSize;
  let held = false;
  if (full && units.length > 1 && units[units.length - 1].album) {
    units.pop();
    held = true;
  }
  return { units, more: full, held };
}

// Where to start the first time a channel is seen (no last_id yet).
// `newest` is the channel's latest messages (any order).
//   backfill 0  → start after the newest message: nothing old is copied
//   backfill N  → copy the last N messages, widened so an album at the
//                 front is not cut in half
// An empty channel starts at 0, so its first post is copied.
export function startCursor(newest, backfill) {
  const msgs = [...newest].sort((a, b) => a.id - b.id);
  if (!msgs.length) return 0;
  if (!(backfill > 0)) return msgs[msgs.length - 1].id;
  if (msgs.length <= backfill) return msgs[0].id - 1;
  let i = msgs.length - backfill;
  const g = msgs[i].groupedId;
  while (g && i > 0 && msgs[i - 1].groupedId === g) i--;
  return msgs[i].id - 1;
}

// The cursor to use this cycle: the crawler's own memory, or what Playbook
// last stored (after a restart), whichever is further on. null = never set.
export function mergeCursor(local, server) {
  const l = local == null ? null : Number(local);
  const s = server == null ? null : Number(server);
  if (l == null) return Number.isFinite(s) ? s : null;
  if (s == null || !Number.isFinite(s)) return l;
  return Math.max(l, s);
}

// Keeps forwards at least `gapMs` apart across all channels.
export function makePacer(gapMs, sleep, now = Date.now) {
  let last = -Infinity;
  return {
    async wait() {
      const due = last + gapMs - now();
      if (due > 0) await sleep(due);
      last = now();
    },
  };
}

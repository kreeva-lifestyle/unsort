// Which screen holds unsaved typing right now (the product page's Facts), so
// the page's Back and the nav can ask "Discard changes?" before leaving
// (mobile.md §6, copy-and-a11y.md §B3). Sheets guard themselves in PbModal.
import { useEffect, useRef } from 'react';

const dirty = new Map<number, string>(); // registration → the confirm title
let seq = 0;

/** Register while `isDirty`; `title` is the confirm's question, naming the thing. */
export function useDirty(isDirty: boolean, title: string) {
  const id = useRef(0);
  if (!id.current) id.current = ++seq;
  useEffect(() => {
    const key = id.current;
    if (!isDirty) return;
    dirty.set(key, title);
    return () => { dirty.delete(key); };
  }, [isDirty, title]);
}

/** The confirm title of the (first) dirty screen, or null when nothing is unsaved. */
export const dirtyTitle = (): string | null => dirty.values().next().value ?? null;

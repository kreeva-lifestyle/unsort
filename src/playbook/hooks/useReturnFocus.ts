// When a detail view (product page, website editor) closes, put focus back on
// the card or row that opened it (copy-and-a11y §B3), never on <body>. The
// opener carries data-open-id; if it is gone (deleted, other page) nothing moves.
import { useEffect, useRef } from 'react';

export function useReturnFocus(openId: string | null) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (openId) { last.current = openId; return; }
    const id = last.current;
    last.current = null;
    if (id) document.querySelector<HTMLElement>(`[data-open-id="${CSS.escape(id)}"]`)?.focus();
  }, [openId]);
}

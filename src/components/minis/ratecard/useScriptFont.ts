// The Great Vibes script used for catalog names on the rate card and the
// index. Canvas text needs the face registered on document.fonts; the load
// is best-effort and never blocks — callers fall back to Sora. Shared by
// RateCardGenerator and CatalogMaker so the font is fetched once per page.
import { useState, useEffect } from 'react';

const SCRIPT_FONT_URL = 'https://fonts.gstatic.com/s/greatvibes/v21/RWmMoKWR9v4ksMfaWd_JN9XFiaQoDmlr.woff2';
let pending: Promise<boolean> | null = null;

const ensure = (): Promise<boolean> => {
  if (!pending) {
    // (No fonts.check() guard: it returns true for families the page never
    // registered, so it would skip the load and we'd render the fallback.)
    const face = new FontFace('Great Vibes', `url(${SCRIPT_FONT_URL})`);
    pending = face.load().then(f => { document.fonts.add(f); return true; }).catch(() => false);
  }
  return pending;
};

/** 'Great Vibes' once loaded, else 'Sora'. */
export function useScriptFont(): string {
  const [ready, setReady] = useState(false);
  useEffect(() => { let alive = true; ensure().then(ok => { if (alive) setReady(ok); }); return () => { alive = false; }; }, []);
  return ready ? 'Great Vibes' : 'Sora';
}

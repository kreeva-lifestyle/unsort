// Display faces the canvases draw with — Great Vibes (script) for catalog
// names on the rate card and index, Cinzel (the Roman capitals of the Arya
// Designs logo) for the codes on catalog pages. Canvas text needs a face
// registered on document.fonts; each load is best-effort, once per page,
// and never blocks — callers fall back to Sora.
// (No fonts.check() guard: it returns true for families the page never
// registered, so it would skip the load and we'd render the fallback.)
import { useState, useEffect } from 'react';

const FACES: Record<string, string> = {
  'Great Vibes': 'https://fonts.gstatic.com/s/greatvibes/v21/RWmMoKWR9v4ksMfaWd_JN9XFiaQoDmlr.woff2',
  'Cinzel': 'https://fonts.gstatic.com/s/cinzel/v26/8vIJ7ww63mVu7gt79mT7.woff2',
};
const pending = new Map<string, Promise<boolean>>();

const ensure = (family: string): Promise<boolean> => {
  let p = pending.get(family);
  if (!p) {
    const face = new FontFace(family, `url(${FACES[family]})`);
    p = face.load().then(f => { document.fonts.add(f); return true; }).catch(() => false);
    pending.set(family, p);
  }
  return p;
};

function useFace(family: string): string {
  const [ready, setReady] = useState(false);
  useEffect(() => { let alive = true; ensure(family).then(ok => { if (alive) setReady(ok); }); return () => { alive = false; }; }, [family]);
  return ready ? family : 'Sora';
}

/** 'Great Vibes' once loaded, else 'Sora'. */
export const useScriptFont = () => useFace('Great Vibes');
/** 'Cinzel' once loaded, else 'Sora'. */
export const useDisplayFont = () => useFace('Cinzel');

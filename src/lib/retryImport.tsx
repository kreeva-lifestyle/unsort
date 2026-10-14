// Lazy chunk loading with one self-heal. A fresh deploy renames the hashed
// chunks, so a stale tab 404s on navigation — one auto-reload fixes that.
// But offline (or with a broken deploy) the reload fails the same way
// forever, looping the page with no explanation. The 30 s guard turns repeat
// failures into a real screen. Used by App.tsx for every page and by the
// Minis hub for every tool, so a tool costs its own chunk only when tapped.
import { lazy } from 'react';
import { T, S } from './theme';

export const ChunkErrorScreen = () => (
  <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <div style={{ textAlign: 'center', maxWidth: 360 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 8 }}>Couldn't load this page</div>
      <p style={{ color: T.tx3, fontSize: 11, marginBottom: 16, lineHeight: 1.5 }}>Check your internet connection, then reload. If it keeps happening, a new version may still be deploying — wait a minute and try again.</p>
      <button onClick={() => window.location.reload()} style={{ ...S.btnPrimary, padding: '7px 18px', fontSize: 11 }}>Reload</button>
    </div>
  </div>
);

export const retryImport = (fn: () => Promise<any>) => lazy(() =>
  fn().catch(() => {
    // Offline, a reload cannot fetch anything either — it would only wipe
    // the in-memory state of every mounted tab (a half-filled form, an
    // imported sheet). Show the screen instead; its Reload button is there
    // for when the connection returns.
    if (!navigator.onLine) return { default: ChunkErrorScreen };
    let last = 0;
    try { last = Number(sessionStorage.getItem('chunkReloadedAt')) || 0; } catch {}
    if (Date.now() - last > 30_000) {
      try { sessionStorage.setItem('chunkReloadedAt', String(Date.now())); } catch {}
      window.location.reload();
      return new Promise<never>(() => {});
    }
    return { default: ChunkErrorScreen };
  })
);

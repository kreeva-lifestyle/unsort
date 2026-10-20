// Videos moved or deleted from the PC folder by hand: the server is told,
// so they stop showing "Saved" in the app (a Dropbox / Drive copy still
// plays). Checked every 10 minutes from the check-in loop.
import { log } from './util.mjs';

const EVERY_MS = Number(process.env.PACKCAM_REMOVED_CHECK_MS) || 10 * 60_000;   // env: tests only

export function makeRemovedReporter(api, state) {
  let lastCheck = 0;
  return async function reportRemoved(now) {
    if (now - lastCheck < EVERY_MS) return;
    lastCheck = now;
    const ids = state.removedFiles();
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500);
      await api.removed(part);
      state.forgetFiles(part);
      log(`${part.length} video(s) moved or deleted from the PC folder`);
    }
  };
}

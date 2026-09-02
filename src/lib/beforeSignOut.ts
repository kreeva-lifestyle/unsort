// Work that must finish under the CURRENT user's session before sign-out.
// PackTime's sheet-sync queue lives at module scope, so without this a
// sign-out on a shared PackStation PC left one operator's unflushed scans to
// flush under the next operator's token. Registrants are awaited with a cap
// so a dead network can never trap the user on the sign-out button.
type Hook = () => Promise<void> | void;
const hooks = new Set<Hook>();

export function registerBeforeSignOut(fn: Hook): () => void {
  hooks.add(fn);
  return () => { hooks.delete(fn); };
}

export async function runBeforeSignOut(capMs = 8000): Promise<void> {
  if (hooks.size === 0) return;
  const all = Promise.allSettled([...hooks].map(fn => Promise.resolve().then(fn)));
  await Promise.race([all, new Promise<void>(r => setTimeout(r, capMs))]);
}

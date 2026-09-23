// Face ID / biometric unlock — device-local WebAuthn gate.
//
// Model: the user signs in with email/password once, then enrolls a PLATFORM
// authenticator credential (Face ID / Touch ID / Windows Hello). From then on,
// "sign out" and the 30-min inactivity timeout LOCK the app (the Supabase
// session stays on this device) instead of destroying the session. Unlocking
// runs navigator.credentials.get() with userVerification:'required' — the OS
// shows the Face ID prompt; the kept session is then re-validated once online
// (an offline unlock keeps the session and asks to retry — it never fails
// closed on a missing network, only on a rejected session).
//
// This is deliberately a device-local user-verification gate, not
// server-verified passkey auth: the credential never leaves the device, no
// assertion is sent anywhere, and email/password remains the only way to
// CREATE a session. What IS checked locally: the assertion's user handle must
// be the enrolled account, so another person's passkey on the same phone
// cannot open this session.
//
// Self-healing: iOS keeps the passkey in iCloud Keychain but this enrolment
// record in the app's own storage. When the two drift (enrolled in Safari
// then installed, passkey replaced, device restore), a pinned lookup fails
// and we retry once with a discoverable-credential prompt and re-pin the id
// that answers. Three failed prompts in a row hand the user to email login.

const CRED_KEY = 'doFaceIdCred';
const LOCK_KEY = 'doAppLocked';
const FAILS_KEY = 'doFaceIdFails';
export const FACE_ID_MAX_FAILS = 3;
// Our own deadline on every OS prompt. The WebAuthn `timeout` is only a
// hint, and a home-screen web app on iOS can leave create()/get() pending
// for good when the passkey sheet never comes up — the button then read
// "Waiting for Face ID…" with no way out. Past this, the call is aborted
// and reported as a timeout the user can retry or cancel.
export const FACE_ID_PROMPT_MS = 45_000;

export type FaceIdEnrollment = { credId: string; userId: string; email: string; enrolledAt: string };
export type FaceIdFailCode = 'not_enrolled' | 'cancelled' | 'timeout' | 'wrong_host' | 'unsupported' | 'mismatch' | 'aborted' | 'too_many' | 'exists' | 'failed';
export type FaceIdResult = { ok: true } | { ok: false; code: FaceIdFailCode; error: string };

const MSG: Record<FaceIdFailCode, string> = {
  not_enrolled: 'Face ID is not set up on this device.',
  cancelled: "Face ID didn't complete. Tap to try again, or sign in with email.",
  timeout: "Face ID didn't respond — tap to try again. If it keeps happening, close the app fully and open it again.",
  wrong_host: 'Face ID is set up for a different web address. Sign in with email, then enable Face ID again here.',
  unsupported: 'Face ID is not available on this device or browser.',
  mismatch: 'This passkey belongs to a different account. Sign in with email.',
  aborted: 'Face ID was interrupted. Tap to try again.',
  too_many: "Face ID isn't working on this device — sign in with email, then enable Face ID again in My Profile.",
  exists: 'A Face ID passkey already exists for this account but could not be read. Delete it in iOS Settings → Passwords and try again.',
  failed: 'Face ID verification failed. Sign in with email instead.',
};
const fail = (code: FaceIdFailCode): FaceIdResult => ({ ok: false, code, error: MSG[code] });

const b64url = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string): Uint8Array | null => {
  try {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  } catch { return null; }
};
const randomChallenge = () => crypto.getRandomValues(new Uint8Array(32));
const decodeHandle = (buf: ArrayBuffer | null | undefined): string | null => (buf ? new TextDecoder().decode(buf) : null);

export const faceIdSupported = async (): Promise<boolean> => {
  try {
    if (!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
};

export const getFaceIdEnrollment = (): FaceIdEnrollment | null => {
  try {
    const raw = localStorage.getItem(CRED_KEY);
    if (!raw) return null;
    const e = JSON.parse(raw);
    return e && typeof e.userId === 'string' && e.userId && typeof e.credId === 'string' && e.credId ? e as FaceIdEnrollment : null;
  } catch { return null; }
};

/** Enrolled for THIS user. No user id → false (never "anyone's"). */
export const isFaceIdEnrolledFor = (userId?: string | null): boolean => {
  if (!userId) return false;
  const e = getFaceIdEnrollment();
  return !!e && e.userId === userId;
};

/** A Supabase session is kept on this device (the thing Face ID unlocks). */
export const hasStoredSession = (): boolean => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const v = localStorage.getItem(k);
        if (v && v !== 'null' && JSON.parse(v)?.refresh_token) return true;
      }
    }
  } catch { /* private mode / parse error */ }
  return false;
};

/** Offer the Face ID button only when it can actually work. */
export const faceIdOffered = (): boolean => !!getFaceIdEnrollment() && hasStoredSession();

export const getFaceIdFails = (): number => { try { return Number(localStorage.getItem(FAILS_KEY)) || 0; } catch { return 0; } };
export const clearFaceIdFails = () => { try { localStorage.removeItem(FAILS_KEY); } catch {} };
const bumpFails = (): number => { const n = getFaceIdFails() + 1; try { localStorage.setItem(FAILS_KEY, String(n)); } catch {} return n; };

const saveEnrollment = (e: FaceIdEnrollment): boolean => { try { localStorage.setItem(CRED_KEY, JSON.stringify(e)); return true; } catch { return false; } };

const getAssertion = (allow: Uint8Array[] | null, signal?: AbortSignal) =>
  navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: (allow || []).map(id => ({ type: 'public-key' as const, id: id.buffer as ArrayBuffer, transports: ['internal' as AuthenticatorTransport] })),
      userVerification: 'required',
      timeout: 60000,
    },
    signal,
  }) as Promise<PublicKeyCredential | null>;

/** One AbortSignal for a prompt: the caller's signal (a Cancel tap) or our
 *  deadline, whichever fires first. `timedOut()` tells the two apart. */
const withDeadline = (outer: AbortSignal | undefined, ms: number) => {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, ms);
  const onOuter = () => ctrl.abort();
  if (outer) { if (outer.aborted) ctrl.abort(); else outer.addEventListener('abort', onOuter, { once: true }); }
  return { signal: ctrl.signal, timedOut: () => timedOut, done: () => { clearTimeout(timer); outer?.removeEventListener('abort', onOuter); } };
};

const classify = (err: unknown, startedAt: number, timedOut = false): FaceIdFailCode => {
  const name = (err as { name?: string })?.name || '';
  if (name === 'AbortError') return timedOut ? 'timeout' : 'aborted';
  if (name === 'SecurityError') return 'wrong_host';
  if (name === 'NotSupportedError') return 'unsupported';
  if (name === 'NotAllowedError') return Date.now() - startedAt > 55_000 ? 'timeout' : 'cancelled';
  return 'failed';
};

export const enrollFaceId = async (user: { id: string; email?: string | null; full_name?: string | null }, outer?: AbortSignal, deadlineMs = FACE_ID_PROMPT_MS): Promise<FaceIdResult> => {
  const record = (rawId: ArrayBuffer): FaceIdResult =>
    saveEnrollment({ credId: b64url(rawId), userId: user.id, email: user.email || '', enrolledAt: new Date().toISOString() })
      ? { ok: true } : { ok: false, code: 'failed', error: 'Could not save the Face ID setup on this device (storage blocked).' };
  const startedAt = Date.now();
  const dl = withDeadline(outer, deadlineMs);
  const { signal } = dl;
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: 'DailyOffice', id: window.location.hostname },
        user: { id: new TextEncoder().encode(user.id), name: user.email || 'user', displayName: user.full_name || user.email || 'DailyOffice user' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        // residentKey 'required': the passkey is discoverable, so a lost or
        // stale credential id can be recovered with an empty allow-list.
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'required' },
        timeout: 60000,
        attestation: 'none',
      },
      signal,
    }) as PublicKeyCredential | null;
    if (!cred) return fail('cancelled');
    return record(cred.rawId);
  } catch (e: unknown) {
    const name = (e as { name?: string })?.name || '';
    if (name === 'InvalidStateError') {
      // A passkey for this account already exists on the authenticator (made
      // in Safari, or before a reinstall). Ask it to answer once and pin the
      // id it returns — never store an empty id.
      try {
        const a = await getAssertion([], signal);
        const handle = decodeHandle((a?.response as AuthenticatorAssertionResponse | undefined)?.userHandle);
        if (a && handle === user.id) return record(a.rawId);
        return fail('exists');
      } catch (e2: unknown) { const c = classify(e2, startedAt, dl.timedOut()); return c === 'timeout' || c === 'aborted' ? fail(c) : fail('exists'); }
    }
    const code = classify(e, startedAt, dl.timedOut());
    return code === 'cancelled' ? { ok: false, code, error: 'Face ID setup was cancelled.' } : fail(code);
  } finally { dl.done(); }
};

/** Returns true when the enrolment was actually removed. */
export const disableFaceId = (): boolean => {
  try { localStorage.removeItem(CRED_KEY); localStorage.removeItem(LOCK_KEY); localStorage.removeItem(FAILS_KEY); return true; } catch { return false; }
};

// One OS prompt. Pinned credential first; if the platform cannot find it
// (stale id) retry once with a discoverable prompt and re-pin. The assertion's
// user handle must be the enrolled account.
export const verifyFaceId = async (outer?: AbortSignal, deadlineMs = FACE_ID_PROMPT_MS): Promise<FaceIdResult> => {
  const e = getFaceIdEnrollment();
  if (!e) return fail('not_enrolled');
  if (getFaceIdFails() >= FACE_ID_MAX_FAILS) return fail('too_many');
  const pinned = fromB64url(e.credId);
  const startedAt = Date.now();
  const dl = withDeadline(outer, deadlineMs);
  const { signal } = dl;
  let assertion: PublicKeyCredential | null = null;
  try {
    assertion = await getAssertion(pinned ? [pinned] : [], signal);
  } catch (err: unknown) {
    const code = classify(err, startedAt, dl.timedOut());
    if (code === 'cancelled' && pinned) {
      try { assertion = await getAssertion([], signal); }
      catch (err2: unknown) { return afterFail(classify(err2, startedAt, dl.timedOut())); }
    } else {
      return afterFail(code);
    }
  } finally { dl.done(); }
  if (!assertion) return afterFail('failed');
  const handle = decodeHandle((assertion.response as AuthenticatorAssertionResponse).userHandle);
  if (handle && handle !== e.userId) return afterFail('mismatch');
  const answered = b64url(assertion.rawId);
  if (answered !== e.credId) saveEnrollment({ ...e, credId: answered });
  clearFaceIdFails();
  return { ok: true };
};

const afterFail = (code: FaceIdFailCode): FaceIdResult => {
  if (code === 'aborted' || code === 'timeout') return fail(code);   // a second tap or a prompt that never came — not the user's fault
  const n = bumpFails();
  return n >= FACE_ID_MAX_FAILS ? fail('too_many') : fail(code);
};

export const lockApp = (): boolean => { try { localStorage.setItem(LOCK_KEY, '1'); return true; } catch { return false; } };
export const unlockApp = () => { try { localStorage.removeItem(LOCK_KEY); } catch {} };
export const isAppLocked = (): boolean => { try { return localStorage.getItem(LOCK_KEY) === '1'; } catch { return false; } };

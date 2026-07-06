// Face ID / biometric unlock — device-local WebAuthn gate.
//
// Model: the user signs in with email/password once, then enrolls a PLATFORM
// authenticator credential (Face ID / Touch ID / Windows Hello). From then on,
// "sign out" and the 30-min inactivity timeout LOCK the app (the Supabase
// session stays on this device) instead of destroying the session. Unlocking
// runs navigator.credentials.get() with userVerification:'required' — the OS
// shows the Face ID prompt and the app resumes with ZERO network round-trips.
//
// This is deliberately a device-local user-verification gate, not
// server-verified passkey auth: the credential never leaves the device, no
// assertion is sent anywhere, and email/password remains the only way to
// CREATE a session. Same trust model as a banking app's biometric app-lock.
// If the kept session ever expires, unlock fails closed and the user must
// sign in with email again.

const CRED_KEY = 'doFaceIdCred';
const LOCK_KEY = 'doAppLocked';

export type FaceIdEnrollment = { credId: string; userId: string; email: string; enrolledAt: string };

const b64url = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string): Uint8Array => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const randomChallenge = () => crypto.getRandomValues(new Uint8Array(32));

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
    return e && e.credId && e.userId ? e as FaceIdEnrollment : null;
  } catch { return null; }
};

export const isFaceIdEnrolledFor = (userId?: string | null): boolean => {
  const e = getFaceIdEnrollment();
  return !!e && (!userId || e.userId === userId);
};

export const enrollFaceId = async (user: { id: string; email?: string | null; full_name?: string | null }): Promise<{ ok: boolean; error?: string }> => {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: 'DailyOffice', id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.email || 'user',
          displayName: user.full_name || user.email || 'DailyOffice user',
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
        attestation: 'none',
      },
    }) as PublicKeyCredential | null;
    if (!cred) return { ok: false, error: 'Face ID setup was cancelled.' };
    const enrollment: FaceIdEnrollment = {
      credId: b64url(cred.rawId),
      userId: user.id,
      email: user.email || '',
      enrolledAt: new Date().toISOString(),
    };
    localStorage.setItem(CRED_KEY, JSON.stringify(enrollment));
    return { ok: true };
  } catch (e: unknown) {
    const name = (e as { name?: string })?.name || '';
    if (name === 'NotAllowedError') return { ok: false, error: 'Face ID setup was cancelled or timed out.' };
    if (name === 'InvalidStateError') {
      // A credential for this account already exists on the authenticator —
      // treat as enrolled rather than failing.
      const enrollment: FaceIdEnrollment = { credId: '', userId: user.id, email: user.email || '', enrolledAt: new Date().toISOString() };
      localStorage.setItem(CRED_KEY, JSON.stringify(enrollment));
      return { ok: true };
    }
    return { ok: false, error: 'Face ID is not available on this device or browser.' };
  }
};

export const disableFaceId = () => { try { localStorage.removeItem(CRED_KEY); localStorage.removeItem(LOCK_KEY); } catch {} };

// Verify the user with the platform authenticator. Fast path: one OS prompt,
// no network. allowCredentials pins the enrolled credential when we have its
// id; an empty list lets the platform pick the resident key (InvalidState
// enrollments).
export const verifyFaceId = async (): Promise<{ ok: boolean; error?: string }> => {
  const e = getFaceIdEnrollment();
  if (!e) return { ok: false, error: 'Face ID is not set up on this device.' };
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: e.credId ? [{ type: 'public-key', id: fromB64url(e.credId).buffer as ArrayBuffer, transports: ['internal' as AuthenticatorTransport] }] : [],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return assertion ? { ok: true } : { ok: false, error: 'Face ID verification failed.' };
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name || '';
    if (name === 'NotAllowedError') return { ok: false, error: 'Face ID was cancelled.' };
    return { ok: false, error: 'Face ID verification failed. Sign in with email instead.' };
  }
};

export const lockApp = () => { try { localStorage.setItem(LOCK_KEY, '1'); } catch {} };
export const unlockApp = () => { try { localStorage.removeItem(LOCK_KEY); } catch {} };
export const isAppLocked = (): boolean => { try { return localStorage.getItem(LOCK_KEY) === '1'; } catch { return false; } };

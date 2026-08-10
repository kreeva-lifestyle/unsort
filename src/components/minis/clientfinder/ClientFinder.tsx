// Client Finder - two ways in, chosen by the selector at the top:
//   Find via Photo  - upload a product photo (or pick a SKU) and get the
//                     websites that have posted that image (all state below).
//   Find via Google - the downloadable Maps lead-generation tool (GoogleLeads).
//   Find via Social Ads - Meta Ad Library keyword search: the brands actively
//                     advertising a product per country (SocialAds).
//
// The engine is Google Cloud Vision WEB_DETECTION, not a language model: no LLM
// can reverse image search, because none has an image index behind it. The UI
// says so plainly rather than implying magic, because the failure mode that
// matters here is a user reading "no websites found" as "nobody copied this".
import { useState, useRef, useEffect } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import SkuInput from '../../ui/SkuInput';
import PhotoPicker from './PhotoPicker';
import { call, explain, fileToB64, type Hit, type FolderCandidate } from './api';
import { exportHitsXlsx } from './exportHits';
import HitList from './HitList';
import GoogleLeads from './GoogleLeads';
import SocialAds from './SocialAds';

type Finder = 'photo' | 'google' | 'ads';
type Mode = 'upload' | 'sku';

/** A picked photo plus the blob URL showing it. Kept as one object so the two
 *  can never drift apart, and so the URL can be revoked when the photo goes. */
interface Shot { file: File; url: string }

/** Same file picked twice is the same photo. */
const shotKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

export default function ClientFinder({ addToast }: { addToast: (m: string, t?: string) => void }) {
  // Two very different ways to find clients: reverse image search (server-side
  // Vision calls) vs the downloadable Google Maps lead tool. Photo state below
  // is left untouched on a switch, so flipping over and back loses nothing.
  const [finder, setFinder] = useState<Finder>('photo');
  const [mode, setMode] = useState<Mode>('upload');
  // File and its preview URL travel together so removing one can never leave
  // the two lists misaligned — and so the object URL is always revocable.
  const [shots, setShots] = useState<Shot[]>([]);
  const [sku, setSku] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [bestGuess, setBestGuess] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ used: number; cap: number } | null>(null);
  const [error, setError] = useState('');
  // Set when one SKU lives in several Dropbox folders. Not an error — the app
  // is asking which folder, and these are the answers it will accept.
  const [candidates, setCandidates] = useState<FolderCandidate[]>([]);
  // Which of the SKU's Dropbox photos to search. Each one is a SEPARATE Vision
  // call, so the count is shown on the button rather than hidden.
  const [photos, setPhotos] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Unmount is the one exit removeShot/reset don't cover: Minis mounts these
  // tools by route, so switching tools with photos attached leaked every blob
  // URL for the life of the tab. The ref keeps the cleanup closure current.
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;
  useEffect(() => () => { shotsRef.current.forEach(s => URL.revokeObjectURL(s.url)); }, []);

  const subject = mode === 'sku'
    ? sku.trim().toUpperCase()
    : shots.length > 1 ? `${shots.length}-photos` : (shots[0]?.file.name || 'Upload');

  // Photos ADD rather than replace, so a batch can be built up from several
  // folders. Non-images are counted and reported once — one toast per rejected
  // file would bury the screen when a whole folder gets selected by mistake.
  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const incoming = [...list];
    const images = incoming.filter(f => f.type.startsWith('image/'));
    const rejected = incoming.length - images.length;
    if (rejected) addToast(rejected === 1 ? 'Skipped 1 file — not an image' : `Skipped ${rejected} files — not images`, 'error');
    if (!images.length) return;

    // createObjectURL / revokeObjectURL stay OUTSIDE the state updater —
    // StrictMode invokes updaters twice in dev, which would mint a second set
    // of blob URLs and leak the first. These are event handlers, so reading
    // `shots` from the closure is current.
    const seen = new Set(shots.map(s => shotKey(s.file)));
    const added: Shot[] = [];
    for (const f of images) {
      const k = shotKey(f);
      if (seen.has(k)) continue;
      seen.add(k);
      added.push({ file: f, url: URL.createObjectURL(f) });
    }
    if (!added.length) return;
    setShots([...shots, ...added]);
    setHits(null); setError('');
  };

  // Revoking matters here: a batch of phone photos held as blob URLs is real
  // memory, and nothing else ever frees them.
  const removeShot = (key: string) => {
    const gone = shots.find(s => shotKey(s.file) === key);
    if (gone) URL.revokeObjectURL(gone.url);
    setShots(shots.filter(s => shotKey(s.file) !== key));
  };

  const reset = () => {
    shots.forEach(s => URL.revokeObjectURL(s.url));
    setShots([]);
    setSku(''); setHits(null); setBestGuess(null); setError(''); setCandidates([]); setPhotos([]);
  };

  // How many Vision calls one tap will make, in whichever mode is active.
  const count = mode === 'sku' ? photos.length : shots.length;
  const nothingPicked = count === 0;

  // Strongest wins when two photos turn up the same page.
  const KIND_RANK = { full: 0, partial: 1, page: 2, similar: 3 } as const;

  const search = async (folder?: string) => {
    if (busy) return;
    if (mode === 'upload' && shots.length === 0) { setError('Attach a photo first'); return; }
    if (mode === 'sku' && !sku.trim()) { setError('Enter a SKU'); return; }
    if (mode === 'sku' && photos.length === 0) { setError('Pick at least one photo'); return; }

    // One request per photo, deliberately. Looping server-side inside a single
    // request would let one tap make N Vision calls while recording ONE search,
    // which is a hole straight through the daily cap.
    //
    // Dropbox URLs in SKU mode, picked Files in upload mode — the loop is the
    // same either way, only the payload differs.
    const targets: (string | File)[] = mode === 'sku' ? photos : shots.map(s => s.file);
    setBusy(true); setError(''); setHits(null); setCandidates([]);
    setProgress(targets.length > 1 ? { done: 0, total: targets.length } : null);

    // Deduped across photos by URL — the question is "who has this product",
    // not "which of my photos found them".
    const merged = new Map<string, Hit>();
    let guess: string | null = null;
    let searched = 0;
    // One bad photo (HEIC, oversized, Vision hiccup) must not throw away the
    // pages other photos already paid a Vision call to find. Failures are
    // remembered and reported; the loop keeps going.
    const failed: string[] = [];
    const nameOf = (t: string | File, i: number) => t instanceof File ? t.name : `photo ${i + 1}`;

    try {
      for (let ti = 0; ti < targets.length; ti++) {
        const target = targets[ti];
        const payload = mode === 'sku'
          ? { action: 'search', source: 'sku', sku: sku.trim().toUpperCase(), folder: folder || undefined, image_url: (target as string) || undefined }
          : { action: 'search', source: 'upload', image_b64: await fileToB64(target as File) };
        const { status, data } = await call(payload);

        // A folder choice is a question, not a failure — offer the options
        // instead of dead-ending on a red box.
        if (data?.needsFolder && data.candidates?.length) {
          setCandidates(data.candidates); setError(''); return;
        }
        // Stop on the daily cap, but KEEP what earlier photos already found and
        // say exactly how far it got. Silent truncation would be worse.
        if (status === 429) {
          setError(`Searched ${searched} of ${targets.length} photos — ${data?.error || 'daily limit reached'}.`);
          break;
        }
        if (!data?.ok) { failed.push(`${nameOf(target, ti)}: ${explain(data, status)}`); continue; }
        // The server can succeed but fail to store the result — it says so
        // once, and hiding that would misrepresent what the cache will do.
        if (data.warning) addToast(String(data.warning), 'error');

        for (const h of data.hits || []) {
          const prev = merged.get(h.url);
          if (!prev) { merged.set(h.url, h); continue; }
          // Two photos can turn up the same page. Keep the strongest match
          // kind, and take the MEASUREMENT (dimensions + bytes + measured URL)
          // as one unit from the better-measured response — mixing one file's
          // pixels with another file's bytes described an image that does not
          // exist, and that fabrication went straight into the Excel export.
          const best: Hit = KIND_RANK[h.match_kind] < KIND_RANK[prev.match_kind] ? { ...h } : { ...prev };
          const px = (x: Hit) => (x.width ?? 0) * (x.height ?? 0);
          const score = (x: Hit) => px(x) || (x.bytes ?? 0);
          const measured = score(h) > score(prev) ? h : prev;
          best.width = measured.width; best.height = measured.height;
          best.bytes = measured.bytes; best.image_url = measured.image_url;
          merged.set(h.url, best);
        }
        guess = guess ?? (data.best_guess ?? null);
        if (typeof data.used === 'number' && typeof data.cap === 'number') setQuota({ used: data.used, cap: data.cap });
        searched++;
        setProgress(targets.length > 1 ? { done: searched, total: targets.length } : null);
      }

      if (failed.length) {
        const m = `${failed.length} of ${targets.length} photo${failed.length === 1 ? '' : 's'} failed — ${failed.slice(0, 2).join('; ')}${failed.length > 2 ? '…' : ''}`;
        setError(m); addToast(m, 'error');
      }
      // Nothing was actually searched (the cap bit on the first photo, or every
      // photo failed). Saying "no websites found" here would claim a result
      // that was never obtained; the error already explains what happened.
      if (searched === 0) return;

      // Biggest copy first, so the Excel export comes out in the same order the
      // list shows. 'similar' stays pinned below every real match — a large
      // look-alike is not evidence anyone used your photo.
      const px = (x: Hit) => (x.width ?? 0) * (x.height ?? 0);
      const band = (x: Hit) => (x.match_kind === 'similar' ? 1 : 0);
      const all = [...merged.values()].sort((a, b) =>
        band(a) - band(b)
        || px(b) - px(a)
        || (b.bytes ?? 0) - (a.bytes ?? 0)
        || KIND_RANK[a.match_kind] - KIND_RANK[b.match_kind]);
      setHits(all);
      setBestGuess(guess);
      const real = all.filter(h => h.match_kind !== 'similar').length;
      addToast(
        real === 0 ? 'No websites found using these photos' : `Found ${real} page${real === 1 ? '' : 's'} across ${searched} photo${searched === 1 ? '' : 's'}`,
        real === 0 ? 'error' : 'success',
      );
    } catch (e) {
      const m = friendlyError(e);
      setError(m); addToast(m, 'error');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div style={{ fontFamily: T.sans, color: T.tx }}>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {(['photo', 'google', 'ads'] as Finder[]).map(f => (
            <button
              key={f}
              onClick={() => setFinder(f)}
              style={{ ...(finder === f ? S.btnPrimary : S.btnGhost), flex: 1, minHeight: 44 }}
            >
              {f === 'photo' ? 'Find via Photo' : f === 'google' ? 'Find via Google' : 'Find via Social Ads'}
            </button>
          ))}
        </div>

        {finder === 'google' && <GoogleLeads />}

        {finder === 'ads' && <SocialAds addToast={addToast} />}

        {finder === 'photo' && (<>
        <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.6, marginBottom: 12 }}>
          Searches Google&rsquo;s image index for pages showing this product. It only finds
          what Google has indexed &mdash; private catalogues and wholesale portals stay invisible,
          so no result is never proof that nobody copied a design.
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['upload', 'sku'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setHits(null); setError(''); setCandidates([]); setPhotos([]); }}
              style={{
                ...(mode === m ? S.btnPrimary : S.btnGhost),
                flex: 1, minHeight: 44,
              }}
            >
              {m === 'upload' ? 'Upload a photo' : 'Pick a SKU'}
            </button>
          ))}
        </div>

        {mode === 'upload' ? (
          <div>
            {/* A <label> wrapping the input, NOT a button calling .click():
                the tap opens the picker natively, with no JavaScript in the
                path. And the input is offscreen rather than display:none —
                iOS silently drops .click() on an unrendered input, which is
                why this button did nothing on the phone. Same pattern as
                OdetteImport / BrandTags / Minis. */}
            <label style={{ ...S.btnGhost, width: '100%', minHeight: 44, position: 'relative', overflow: 'hidden' }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
                // Cleared after every pick so choosing the same file again
                // still fires onChange.
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
              />
              {shots.length
                ? `${shots.length} photo${shots.length === 1 ? '' : 's'} — add more`
                : 'Choose or take photos'}
            </label>

            {shots.length > 0 && (
              <>
                {/* Same grid as the SKU photo picker, so both modes look and
                    behave alike. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6, marginTop: 10 }}>
                  {shots.map(s => {
                    const key = shotKey(s.file);
                    return (
                      <div key={key} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.bd}`, background: T.s }}>
                        <img src={s.url} alt={s.file.name} title={s.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        <button
                          type="button"
                          onClick={() => removeShot(key)}
                          aria-label={`Remove ${s.file.name}`}
                          // 30px, not the usual 44: on a 72px tile a 44px
                          // target would cover most of the photo it is meant
                          // to identify. Comfortably tappable in practice.
                          style={{
                            position: 'absolute', top: 3, right: 3, width: 30, height: 30, borderRadius: '50%',
                            background: 'rgba(6,8,16,.78)', border: `1px solid ${T.bd2}`, color: T.tx2,
                            fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >&#215;</button>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: T.tx3, marginTop: 6 }}>
                  {shots.length === 1
                    ? 'Tap × to remove.'
                    : `Searching ${shots.length} photos — each one is a separate search.`}
                </div>
              </>
            )}
          </div>
        ) : (
          <div>
            <div style={S.fLabel}>SKU</div>
            <SkuInput
              value={sku}
              onChange={setSku}
              onKeyDown={e => { if (e.key === 'Enter') search(); }}
              placeholder="e.g. 7101"
              style={{ ...S.fInput, width: '100%', textTransform: 'uppercase' }}
            />
            <PhotoPicker
              sku={sku}
              selected={photos}
              onToggle={u => setPhotos(p => (p.includes(u) ? p.filter(x => x !== u) : [...p, u]))}
              onReplaceAll={setPhotos}
            />
            <div style={{ fontSize: 10, color: T.tx3, marginTop: 6 }}>
              {photos.length
                ? `Searching ${photos.length} photo${photos.length === 1 ? '' : 's'} — each one is a separate search.`
                : 'Type a SKU to load its photos.'}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <button
            // Wrapped, not passed directly: search() now takes an optional
            // folder, and onClick would hand it the MouseEvent.
            onClick={() => search()}
            disabled={busy || nothingPicked}
            style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy || nothingPicked ? 0.5 : 1 }}
          >
            {/* The photo count sits on the control because it IS the cost:
                three photos is three Vision calls and three of the daily 25. */}
            {busy
              ? (progress ? `Searching ${progress.done + 1} of ${progress.total}…` : 'Searching…')
              : count > 1
                ? `Find websites · ${count} photos`
                : 'Find websites'}
          </button>
          {(hits || shots.length > 0 || sku) && (
            <button onClick={reset} style={{ ...S.btnGhost, minHeight: 44 }}>Clear</button>
          )}
          {hits && hits.length > 0 && (
            <button onClick={() => exportHitsXlsx(hits, subject, bestGuess)} style={{ ...S.btnGhost, minHeight: 44 }}>
              Export to Excel
            </button>
          )}
          {quota && (
            <span style={{ fontSize: 10, color: quota.used >= quota.cap ? T.re : T.tx3, marginLeft: 'auto' }}>
              {quota.used} of {quota.cap} searches used today
            </span>
          )}
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginTop: 10 }}>
            {error}
          </div>
        )}

        {/* Amber, not red: nothing has gone wrong — the SKU simply exists in
            more than one Dropbox folder and the app needs to know which.
            Mirrors the Dropbox Link Generator's picker (LinkResult.tsx). */}
        {candidates.length > 0 && (
          <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 6, padding: '10px', marginTop: 10 }}>
            <div style={{ fontSize: 11, color: T.yl, lineHeight: 1.5, marginBottom: 8 }}>
              &ldquo;{sku.trim().toUpperCase()}&rdquo; is in {candidates.length} folders — pick the one you mean:
            </div>
            {candidates.map((c, i) => (
              <button
                key={i}
                onClick={() => search(c.path)}
                disabled={busy}
                style={{
                  ...S.btnGhost, display: 'block', width: '100%', textAlign: 'left',
                  marginTop: i === 0 ? 0 : 6, padding: '10px 12px', minHeight: 44,
                  fontSize: 11, fontFamily: T.mono,
                  pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1,
                }}
              >
                📁 {c.display}
              </button>
            ))}
          </div>
        )}
        </>)}
      </div>

      {finder === 'photo' && hits && (
        <>
          {bestGuess && (
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 8 }}>
              Google reads this image as <span style={{ color: T.tx2 }}>{bestGuess}</span>
            </div>
          )}
          <HitList hits={hits} />
        </>
      )}
    </div>
  );
}

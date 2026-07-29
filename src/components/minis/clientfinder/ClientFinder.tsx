// Client Finder - upload a product photo (or pick a SKU) and get the websites
// that have posted that image.
//
// The engine is Google Cloud Vision WEB_DETECTION, not a language model: no LLM
// can reverse image search, because none has an image index behind it. The UI
// says so plainly rather than implying magic, because the failure mode that
// matters here is a user reading "no websites found" as "nobody copied this".
import { useState, useRef } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import SkuInput from '../../ui/SkuInput';
import PhotoPicker from './PhotoPicker';
import { call, explain, fileToB64, type Hit, type FolderCandidate } from './api';
import { exportHitsXlsx } from './exportHits';
import HitList from './HitList';

type Mode = 'upload' | 'sku';

export default function ClientFinder({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [mode, setMode] = useState<Mode>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
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

  const subject = mode === 'sku' ? sku.trim().toUpperCase() : (file?.name || 'Upload');

  const pick = (f: File) => {
    if (!f.type.startsWith('image/')) { addToast('Pick an image file', 'error'); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setHits(null); setError('');
  };

  const reset = () => {
    setFile(null); setPreview(''); setSku(''); setHits(null); setBestGuess(null); setError(''); setCandidates([]); setPhotos([]);
  };

  // Strongest wins when two photos turn up the same page.
  const KIND_RANK = { full: 0, partial: 1, page: 2, similar: 3 } as const;

  const search = async (folder?: string) => {
    if (busy) return;
    if (mode === 'upload' && !file) { setError('Attach a photo first'); return; }
    if (mode === 'sku' && !sku.trim()) { setError('Enter a SKU'); return; }
    if (mode === 'sku' && photos.length === 0) { setError('Pick at least one photo'); return; }

    // One request per photo, deliberately. Looping server-side inside a single
    // request would let one tap make N Vision calls while recording ONE search,
    // which is a hole straight through the daily cap.
    const targets = mode === 'sku' ? photos : [''];
    setBusy(true); setError(''); setHits(null); setCandidates([]);
    setProgress(targets.length > 1 ? { done: 0, total: targets.length } : null);

    // Deduped across photos by URL — the question is "who has this product",
    // not "which of my photos found them".
    const merged = new Map<string, Hit>();
    let guess: string | null = null;
    let searched = 0;

    try {
      for (const target of targets) {
        const payload = mode === 'sku'
          ? { action: 'search', source: 'sku', sku: sku.trim().toUpperCase(), folder: folder || undefined, image_url: target || undefined }
          : { action: 'search', source: 'upload', image_b64: await fileToB64(file as File) };
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
        if (!data?.ok) { const m = explain(data, status); setError(m); addToast(m, 'error'); return; }

        for (const h of data.hits || []) {
          const prev = merged.get(h.url);
          if (!prev || KIND_RANK[h.match_kind] < KIND_RANK[prev.match_kind]) merged.set(h.url, h);
        }
        guess = guess ?? (data.best_guess ?? null);
        if (typeof data.used === 'number' && typeof data.cap === 'number') setQuota({ used: data.used, cap: data.cap });
        searched++;
        setProgress(targets.length > 1 ? { done: searched, total: targets.length } : null);
      }

      // Nothing was actually searched (the cap bit on the first photo). Saying
      // "no websites found" here would claim a result that was never obtained;
      // the error already explains what happened.
      if (searched === 0) return;

      const all = [...merged.values()].sort((a, b) => KIND_RANK[a.match_kind] - KIND_RANK[b.match_kind]);
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
                style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }}
              />
              {file ? `Change photo — ${file.name}` : 'Choose or take a photo'}
            </label>
            {preview && (
              <img
                src={preview}
                alt="Selected product"
                style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8, border: `1px solid ${T.bd}`, marginTop: 10, background: T.s }}
              />
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
            disabled={busy || (mode === 'sku' && photos.length === 0)}
            style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy || (mode === 'sku' && photos.length === 0) ? 0.5 : 1 }}
          >
            {/* The photo count sits on the control because it IS the cost:
                three photos is three Vision calls and three of the daily 25. */}
            {busy
              ? (progress ? `Searching ${progress.done + 1} of ${progress.total}…` : 'Searching…')
              : mode === 'sku' && photos.length > 1
                ? `Find websites · ${photos.length} photos`
                : 'Find websites'}
          </button>
          {(hits || file || sku) && (
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
      </div>

      {hits && (
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

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
  // Which of the SKU's Dropbox photos to search. Empty = server falls back to
  // the first one, which is the old behaviour.
  const [photo, setPhoto] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const subject = mode === 'sku' ? sku.trim().toUpperCase() : (file?.name || 'Upload');

  const pick = (f: File) => {
    if (!f.type.startsWith('image/')) { addToast('Pick an image file', 'error'); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setHits(null); setError('');
  };

  const reset = () => {
    setFile(null); setPreview(''); setSku(''); setHits(null); setBestGuess(null); setError(''); setCandidates([]); setPhoto('');
  };

  const search = async (folder?: string) => {
    if (busy) return;
    if (mode === 'upload' && !file) { setError('Attach a photo first'); return; }
    if (mode === 'sku' && !sku.trim()) { setError('Enter a SKU'); return; }
    setBusy(true); setError(''); setHits(null); setCandidates([]);
    try {
      const payload = mode === 'sku'
        ? { action: 'search', source: 'sku', sku: sku.trim().toUpperCase(), folder: folder || undefined, image_url: photo || undefined }
        : { action: 'search', source: 'upload', image_b64: await fileToB64(file as File) };
      const { status, data } = await call(payload);
      // A folder choice is a question, not a failure — offer the options
      // instead of dead-ending on a red box.
      if (data?.needsFolder && data.candidates?.length) {
        setCandidates(data.candidates);
        setError('');
        return;
      }
      if (!data?.ok) { const m = explain(data, status); setError(m); addToast(m, 'error'); return; }
      setHits(data.hits || []);
      setBestGuess(data.best_guess ?? null);
      if (typeof data.used === 'number' && typeof data.cap === 'number') setQuota({ used: data.used, cap: data.cap });
      const n = (data.hits || []).length;
      addToast(
        n === 0 ? 'No websites found for that image' : `Found ${n} page${n === 1 ? '' : 's'}${data.cached ? ' (from your earlier search)' : ''}`,
        n === 0 ? 'error' : 'success',
      );
    } catch (e) {
      const m = friendlyError(e);
      setError(m); addToast(m, 'error');
    } finally {
      setBusy(false);
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
              onClick={() => { setMode(m); setHits(null); setError(''); setCandidates([]); setPhoto(''); }}
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
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }}
            />
            <button onClick={() => fileRef.current?.click()} style={{ ...S.btnGhost, width: '100%', minHeight: 44 }}>
              {file ? `Change photo — ${file.name}` : 'Choose or take a photo'}
            </button>
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
            <PhotoPicker sku={sku} selected={photo} onSelect={setPhoto} addToast={addToast} />
            <div style={{ fontSize: 10, color: T.tx3, marginTop: 6 }}>
              {photo
                ? 'Searching the photo you picked.'
                : 'Load the photos and pick one — otherwise the first photo in the folder is used.'}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <button
            // Wrapped, not passed directly: search() now takes an optional
            // folder, and onClick would hand it the MouseEvent.
            onClick={() => search()}
            style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}
          >
            {busy ? 'Searching…' : 'Find websites'}
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

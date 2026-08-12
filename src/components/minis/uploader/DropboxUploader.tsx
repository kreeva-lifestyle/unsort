// Dropbox Uploader — any signed-in user sends any file to Dropbox, choosing
// the destination folder EVERY time (nothing is remembered, by design: the
// wrong folder is worse than one extra tap). Files upload one at a time with
// live progress; each row keeps its own outcome so a failure in the middle of
// a batch never hides what already succeeded.
//
// Destinations are the folders an admin configured (Link Generator search
// folders + the Forward→Dropbox folder), enforced server-side — a browser
// cannot name an arbitrary Dropbox path.
import { useState, useEffect, useRef } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { call } from '../dropboxlinks/api';
import { uploadFile, errText, humanBytes, MAX_FILE, type UpFolder, type UpItem } from './api';
import UploadRow from './UploadRow';

const keyOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

export default function DropboxUploader({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [folders, setFolders] = useState<UpFolder[] | null>(null);
  const [folderErr, setFolderErr] = useState('');
  const [dest, setDest] = useState('');
  const [sub, setSub] = useState('');
  const [items, setItems] = useState<UpItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // The in-flight request, so Stop can abort the actual transfer.
  const holdRef = useRef<{ xhr?: XMLHttpRequest }>({});
  // Cancelling must stop the QUEUE too, not just the current file.
  const stopRef = useRef(false);

  useEffect(() => {
    let stale = false;
    call({ action: 'up_folders' }).then(({ status, data }) => {
      if (stale) return;
      const d = data as Record<string, unknown>;
      if (d?.ok) setFolders((d.folders as UpFolder[]) || []);
      else setFolderErr(String(d?.error) === 'dropbox_not_connected'
        ? 'Dropbox is not connected — an admin can connect it in Trackly → Image Link Check.'
        : String(d?.error) === 'no_folders'
          ? 'No upload folders are configured yet — an admin can add them in Minis → Dropbox Link Generator → Settings.'
          : String(d?.details || d?.error || `Could not load the folders (${status})`));
    }).catch(e => { if (!stale) setFolderErr(friendlyError(e)); });
    return () => { stale = true; };
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const seen = new Set(items.map(i => keyOf(i.file)));
    const add: UpItem[] = [];
    let dupes = 0, huge = 0;
    for (const f of [...list]) {
      if (seen.has(keyOf(f))) { dupes++; continue; }
      seen.add(keyOf(f));
      if (f.size > MAX_FILE) { huge++; continue; }
      add.push({ id: `${keyOf(f)}|${Math.random().toString(36).slice(2, 8)}`, file: f, state: 'queued', pct: 0 });
    }
    if (dupes) addToast(`${dupes} file${dupes > 1 ? 's are' : ' is'} already in the list`, 'error');
    if (huge) addToast(`${huge} file${huge > 1 ? 's' : ''} skipped — over the ${humanBytes(MAX_FILE)} limit`, 'error');
    if (add.length) setItems(prev => [...prev, ...add]);
  };

  const patch = (id: string, p: Partial<UpItem>) => setItems(prev => prev.map(i => (i.id === id ? { ...i, ...p } : i)));

  const runQueue = async (ids?: string[]) => {
    if (busy) return;
    if (!dest) { addToast('Choose the Dropbox folder to upload into', 'error'); return; }
    const queue = (ids ? items.filter(i => ids.includes(i.id)) : items).filter(i => i.state === 'queued' || i.state === 'error' || i.state === 'cancelled');
    if (queue.length === 0) { addToast('Add a file first', 'error'); return; }
    setBusy(true);
    stopRef.current = false;
    let ok = 0, failed = 0, stopped = 0;
    for (const it of queue) {
      if (stopRef.current) { patch(it.id, { state: 'cancelled', pct: 0, message: undefined }); stopped++; continue; }
      patch(it.id, { state: 'uploading', pct: 0, message: undefined });
      try {
        const path = await uploadFile(it.file, dest, sub, pct => patch(it.id, { pct }), holdRef.current);
        patch(it.id, { state: 'done', pct: 100, path, message: undefined });
        ok++;
      } catch (e) {
        const msg = errText(e);
        const cancelled = msg === 'Cancelled';
        patch(it.id, { state: cancelled ? 'cancelled' : 'error', pct: 0, message: cancelled ? undefined : msg });
        if (cancelled) stopped++; else failed++;
      }
    }
    holdRef.current = {};
    setBusy(false);
    // One honest summary: never report success while something failed.
    if (ok && !failed && !stopped) addToast(`${ok} file${ok > 1 ? 's' : ''} uploaded to Dropbox`, 'success');
    else if (ok || failed || stopped) {
      addToast([ok ? `${ok} uploaded` : '', failed ? `${failed} failed` : '', stopped ? `${stopped} stopped` : ''].filter(Boolean).join(' · '), failed ? 'error' : 'success');
    }
  };

  const stopAll = () => { stopRef.current = true; holdRef.current.xhr?.abort(); };
  const pending = items.filter(i => i.state === 'queued' || i.state === 'error' || i.state === 'cancelled').length;

  return (
    <div style={{ fontFamily: T.sans, color: T.tx }}>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.6, marginBottom: 12 }}>
          Send any file straight to Dropbox. Pick the destination folder each time — nothing is remembered, so a file never lands somewhere by accident.
        </div>

        {folderErr && <div style={{ background: 'oklch(0.63 0.22 25 / .08)', border: '1px solid oklch(0.63 0.22 25 / .2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10 }}>{folderErr}</div>}

        <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Upload into <span style={{ color: T.re }}>*</span></label>
        <select value={dest} onChange={e => setDest(e.target.value)} disabled={busy || !folders?.length}
          style={{ ...S.fInput, width: '100%', marginBottom: 10, opacity: busy ? 0.6 : 1 }}>
          <option value="">{folders === null ? 'Loading folders…' : folders.length ? 'Choose a folder…' : 'No folders available'}</option>
          {(folders || []).map(f => <option key={f.path} value={f.path}>{f.label}</option>)}
        </select>

        <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Subfolder <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, fontSize: 9, color: T.tx3 }}>optional — created if new, e.g. DRS300</span></label>
        <input value={sub} onChange={e => setSub(e.target.value)} disabled={busy} placeholder="Leave blank to upload into the folder itself"
          style={{ ...S.fInput, width: '100%', marginBottom: 12, opacity: busy ? 0.6 : 1 }} />

        <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
        <div
          onClick={() => !busy && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); if (!busy) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (!busy) addFiles(e.dataTransfer.files); }}
          style={{ border: `1.5px dashed ${dragOver ? 'oklch(0.55 0.22 265 / .6)' : T.bd2}`, background: dragOver ? T.ac3 : 'rgba(255,255,255,0.015)', borderRadius: 10, padding: '22px 16px', textAlign: 'center', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.ac2 }}>Choose files</div>
          <div style={{ fontSize: 10.5, color: T.tx3, marginTop: 4 }}>or drop them here · any file type · up to {humanBytes(MAX_FILE)} each</div>
        </div>

        {items.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => runQueue()} disabled={busy || !pending || !dest}
              style={{ ...S.btnPrimary, minHeight: 40, flex: 1, minWidth: 160, pointerEvents: busy ? 'none' : 'auto', opacity: busy || !pending || !dest ? 0.5 : 1 }}>
              {busy ? 'Uploading…' : `Upload ${pending} file${pending === 1 ? '' : 's'}`}
            </button>
            {busy && <button onClick={stopAll} style={{ ...S.btnDanger, minHeight: 40 }}>Stop</button>}
            {!busy && <button onClick={() => setItems([])} style={{ ...S.btnGhost, minHeight: 40 }}>Clear list</button>}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(it => (
            <UploadRow key={it.id} item={it}
              onCancel={() => holdRef.current.xhr?.abort()}
              onRetry={() => runQueue([it.id])}
              onRemove={() => setItems(prev => prev.filter(x => x.id !== it.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

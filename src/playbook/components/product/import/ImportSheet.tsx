// "Import from website" (PbModal sheet on phone / modal on desktop): paste a
// store's address → Check website → the preview (platform, estimate, 3
// samples, warnings) and the choices (vendor, in-stock only, their price) →
// the one primary, "Import ~980 products". The run itself happens on the
// server; the Products page shows its progress tile. Only one gradient at a
// time: "Check website" while nothing is checked, the Import button after.
// Typing makes the form dirty (PbModal asks "Discard this import?" on ×/Back).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import type { AddToast } from '../../PbToasts';
import { checkWebsite, startImport, type ImportCheck } from '../../../data/imports';
import { PB, pbErrorBox, pbInput, pbLabel, pbMeta } from '../../../pbTheme';
import { useIsPhone } from '../../../hooks/useIsPhone';
import PbButton from '../../ui/PbButton';
import PbModal from '../PbModal';
import ImportOptions, { type ImportChoices } from './ImportOptions';
import ImportPreview from './ImportPreview';
import LegalLine from './LegalLine';
import { importLabel, normalizeUrl, nothingFound } from './importText';

const CHOICES: ImportChoices = { vendor: '', inStockOnly: true, theirPrice: true };

export default function ImportSheet({ open, initialUrl = '', onClose, onStarted, addToast, onGuide }: {
  open: boolean; initialUrl?: string; onClose: () => void; onStarted: (runId: string) => void; addToast: AddToast; onGuide?: (section: string) => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [choices, setChoices] = useState<ImportChoices>(CHOICES);
  const [busy, setBusy] = useState<'' | 'check' | 'start'>('');
  const [err, setErr] = useState('');
  const [vendorErr, setVendorErr] = useState('');
  const phone = useIsPhone();
  const errBox = useRef<HTMLDivElement>(null);
  useEffect(() => { if (err) errBox.current?.scrollIntoView({ block: 'nearest' }); }, [err]);
  // A Retry from the run tile opens the sheet with that run's address.
  useEffect(() => { if (open) setUrl(initialUrl); }, [open, initialUrl]);

  const reset = () => { setUrl(''); setCheck(null); setChoices(CHOICES); setErr(''); setVendorErr(''); };
  const close = () => { if (busy) return; reset(); onClose(); };
  const usable = check && !nothingFound(check);

  const run = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const address = normalizeUrl(url);
    if (!usable) {
      if (!address) { setErr('Enter the store’s web address, e.g. example.com'); return; }
      setBusy('check'); setErr('');
      try {
        const c = await checkWebsite(address);
        setCheck(c);
        setChoices(x => ({ ...x, vendor: x.vendor || c.vendor_suggestion || c.host }));
      } catch (e2) { setErr(friendlyError(e2)); } finally { setBusy(''); }
      return;
    }
    if (!choices.vendor.trim()) { setVendorErr('Enter a vendor name'); return; }
    setBusy('start'); setErr(''); setVendorErr('');
    try {
      const r = await startImport({ url: address, in_stock_only: choices.inStockOnly, use_their_price: choices.theirPrice, vendor_name: choices.vendor.trim(), estimate: (choices.inStockOnly ? check.estimate_in_stock ?? check.estimate : check.estimate) ?? null });
      addToast(`Import from ${check.host} started — it runs on the server, you can leave this page`, 'success');
      reset(); setBusy('');
      onStarted(r.run_id);
    } catch (e2) { setErr(friendlyError(e2)); setBusy(''); }
  };
  // Editing the address after a check throws the preview away: it belongs to the old address.
  const onUrl = (v: string) => { setUrl(v); if (check) { setCheck(null); setErr(''); } };

  const primary = usable ? importLabel(check, choices.inStockOnly) : 'Check website';
  return (
    <PbModal open={open} title="Import from website" onClose={close} dirty={!!url.trim() || !!check} discardTitle="Discard this import?"
      footer={
        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
          {!phone && <PbButton onClick={close} dim={!!busy}>Cancel</PbButton>}
          <PbButton kind="primary" type="submit" form="pb-import-form" block={phone} busy={!!busy} busyLabel={busy === 'start' ? 'Starting…' : 'Checking…'}>{primary}</PbButton>
        </div>
      }>
      <form id="pb-import-form" onSubmit={run} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ ...pbMeta, margin: 0, color: PB.tx2 }}>
          Paste another store’s web address. Playbook reads its products and adds the ones in stock to Products, where the AI reads them and the website rules take over as usual.
        </p>
        <div style={{ minWidth: 0 }}>
          <label htmlFor="pb-imp-url" style={pbLabel}>Store web address</label>
          <input id="pb-imp-url" type="url" value={url} onChange={e => onUrl(e.target.value)} placeholder="e.g. https://example.com" required
            autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="url" enterKeyHint="go" autoComplete="url" disabled={!!busy}
            className="pb-input" style={{ ...pbInput, fontFamily: PB.mono }} aria-describedby="pb-imp-url-hint" />
          <div id="pb-imp-url-hint" style={{ ...pbMeta, marginTop: 8 }}>
            {check ? 'Change the address to check another store.' : 'Shopify and WooCommerce stores are read fully; other stores as far as their pages allow.'}
          </div>
        </div>
        {check && <ImportPreview check={check} />}
        {usable && <ImportOptions value={choices} onChange={v => { setChoices(v); setVendorErr(''); }} disabled={busy === 'start'} vendorError={vendorErr} />}
        {usable && <LegalLine onGuide={onGuide ? () => { reset(); onClose(); onGuide('import-website'); } : undefined} />}
        {busy === 'check' && <div role="status" style={pbMeta}>Looking at the store… this takes a few seconds.</div>}
        {err && <div ref={errBox} role="alert" style={pbErrorBox}>{err}</div>}
      </form>
    </PbModal>
  );
}

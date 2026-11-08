// New website: only the name and the myshopify.com domain. Everything else
// starts from the column defaults (switched off, routing "none") and is set in
// the editor that opens right after. V2: phone sheet with one full-width
// primary (Cancel is the ×); desktop modal with Cancel + the primary.
import { useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { PbWebsite } from '../../types';
import { pbErrorBox, pbNum } from '../../pbTheme';
import { useIsPhone } from '../../hooks/useIsPhone';
import PbModal from '../product/PbModal';
import { PbButton } from '../ui';
import { cleanDomain, createWebsite, domainProblem } from '../../data/websites';
import { Field, input44 } from './ui';

export default function AddWebsiteModal({ open, onClose, onCreated, addToast }: {
  open: boolean; onClose: () => void; onCreated: (w: PbWebsite) => void; addToast: AddToast;
}) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const phone = useIsPhone();

  const close = () => { setName(''); setDomain(''); setErr(''); setSaving(false); onClose(); };

  const save = async () => {
    const n = name.trim().replace(/\s+/g, ' ');
    const d = cleanDomain(domain);
    if (!n) { setErr('Give the website a name'); return; }
    const p = domainProblem(d);
    if (p) { setErr(p); return; }
    setSaving(true); setErr('');
    try {
      const w = await createWebsite(n, d);
      addToast(`${w.name} added — connect it next`, 'success');
      close();
      onCreated(w);
    } catch (e) {
      const m = friendlyError(e);
      setErr(m); addToast(m, 'error'); setSaving(false);
    }
  };

  return (
    <PbModal open={open} title="Add website" onClose={close} dirty={!!(name.trim() || domain.trim())} discardTitle="Discard this website?"
      footer={
        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
          {!phone && <PbButton onClick={close} dim={saving}>Cancel</PbButton>}
          <PbButton type="submit" form="pb-website-form" kind="primary" block={phone} busy={saving} busyLabel="Adding…">Add website</PbButton>
        </div>
      }>
      <form id="pb-website-form" onSubmit={e => { e.preventDefault(); void save(); }} noValidate>
        <Field label="Name" htmlFor="pbw-name" hint="What you call it, e.g. Indya Ethnic">
          <input id="pbw-name" autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80} className="pb-input"
            aria-describedby="pbw-name-hint" autoCapitalize="words" enterKeyHint="next" style={input44} />
        </Field>
        <Field label="Store domain" htmlFor="pbw-domain" hint="The myshopify.com address (Shopify admin → Settings → Domains), not your custom domain.">
          <input id="pbw-domain" value={domain} onChange={e => setDomain(e.target.value)} placeholder="my-store.myshopify.com" className="pb-input"
            aria-describedby="pbw-domain-hint" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={120} enterKeyHint="done"
            style={{ ...input44, ...pbNum }} />
        </Field>
        {err && <div role="alert" style={pbErrorBox}>{err}</div>}
      </form>
    </PbModal>
  );
}

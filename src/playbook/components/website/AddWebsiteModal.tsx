// New website: only the name and the myshopify.com domain. Everything else
// starts from the column defaults (switched off, routing "none") and is set in
// the editor that opens right after.
import { useState } from 'react';
import { S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { PbWebsite } from '../../types';
import PbModal from '../product/PbModal';
import { cleanDomain, createWebsite, domainProblem } from '../../data/websites';
import { Field, input44 } from './ui';

export default function AddWebsiteModal({ open, onClose, onCreated, addToast }: {
  open: boolean; onClose: () => void; onCreated: (w: PbWebsite) => void; addToast: AddToast;
}) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

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
    <PbModal open={open} title="Add website" onClose={close}>
      <form onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Name" htmlFor="pbw-name" hint="How you call it, e.g. Indya Ethnic">
          <input id="pbw-name" autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80} style={input44} />
        </Field>
        <Field label="Store domain" htmlFor="pbw-domain" hint="The myshopify.com address (Shopify admin → Settings → Domains), not your custom domain.">
          <input id="pbw-domain" value={domain} onChange={e => setDomain(e.target.value)} placeholder="my-store.myshopify.com"
            autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={120} style={input44} />
        </Field>
        {err && <div style={{ ...S.errorBox, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={close} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
          <button type="submit" style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Add website'}
          </button>
        </div>
      </form>
    </PbModal>
  );
}

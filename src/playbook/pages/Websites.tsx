// Websites: one Shopify store per tile (connection status, on/off, publishing
// mode), sized by count so every bento row is full, and the editor for each —
// Connection, Publishing, Routing rules, Pricing, Tags, Content & AI.
// Spec: docs/playbook/product-directory-spec.md. Look: DESIGN.md (V2).
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../../lib/friendlyError';
import { useBackClose } from '../../hooks/useBackClose';
import type { AddToast } from '../components/PbToasts';
import type { PbWebsite } from '../types';
import { listWebsites } from '../data/websites';
import { listVendorsLite, getPbSettingsLite, type VendorLite } from '../data/products';
import { PbButton, PbPageHeader } from '../components/ui';
import WebsiteCard from '../components/website/WebsiteCard';
import AddWebsiteModal from '../components/website/AddWebsiteModal';
import WebsiteEditor, { type Draft } from '../components/website/WebsiteEditor';
import { siteSpans, useSixCols } from '../layout';
import { useReturnFocus } from '../hooks/useReturnFocus';
import { WebsitesEmpty, WebsitesError, WebsitesSkeleton } from '../components/website/shell/WebsiteListStates';

export default function Websites({ addToast }: { addToast: AddToast }) {
  const [sites, setSites] = useState<PbWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const six = useSixCols();
  useReturnFocus(openId);

  // Unsaved editor drafts by site id: the device Back button closes the editor
  // without its confirm, so the draft is kept here and restored on reopen.
  const drafts = useRef(new Map<string, Draft>());
  const onDraft = useCallback((id: string, d: Draft | null) => { if (d) drafts.current.set(id, d); else drafts.current.delete(id); }, []);

  useBackClose(!!openId, () => {
    if (openId && drafts.current.has(openId)) addToast('Unsaved changes kept — open the website again to save or discard them', 'info');
    setOpenId(null);
  });

  // A failed load is never an empty state: it keeps its own error (and still toasts, as before).
  const load = useCallback(async () => {
    try { setSites(await listWebsites()); setLoadErr(''); }
    catch (e) { const m = friendlyError(e); setLoadErr(m); addToast(m, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { void load(); }, [load]);
  const retry = async () => { setRetrying(true); try { await load(); } finally { setRetrying(false); } };

  useEffect(() => {
    Promise.all([listVendorsLite(), getPbSettingsLite()])
      .then(([v, s]) => { setVendors(v); setCategories(s.categories); })
      .catch(e => addToast(friendlyError(e), 'error'));
  }, [addToast]);

  const onSaved = useCallback((w: PbWebsite) => setSites(list => list.map(x => (x.id === w.id ? w : x))), []);
  const open = sites.find(s => s.id === openId);
  const spans = siteSpans(sites.length, six);
  const add = () => setAdding(true);

  return (
    <>
      {open && (
        <WebsiteEditor key={open.id} site={open} initialDraft={drafts.current.get(open.id)} onDraft={onDraft} onClose={() => setOpenId(null)} onSaved={onSaved}
          addToast={addToast} vendors={vendors} categories={categories} />
      )}
      <div style={{ display: open ? 'none' : 'block' }}>
        <PbPageHeader title="Websites" sub="Your Shopify stores — what goes to each, at what price, in which words"
          actions={<PbButton kind="primary" icon="plus" onClick={add}>Add website</PbButton>}
          phoneAction={<PbButton kind="primary" iconOnly icon="plus" aria-label="Add website" onClick={add} />} />
        {loading ? <WebsitesSkeleton />
          : loadErr && sites.length === 0 ? <WebsitesError message={loadErr} onRetry={() => void retry()} busy={retrying} />
            : sites.length === 0 ? <WebsitesEmpty onAdd={add} />
              : (
                <div className="pb-bento pb-bento--auto">
                  {sites.map((s, i) => <WebsiteCard key={s.id} site={s} span={spans[i]} onOpen={() => setOpenId(s.id)} />)}
                </div>
              )}
      </div>
      <AddWebsiteModal open={adding} onClose={() => setAdding(false)} addToast={addToast}
        onCreated={w => { setSites(list => [...list, w].sort((a, b) => a.name.localeCompare(b.name))); setOpenId(w.id); }} />
    </>
  );
}

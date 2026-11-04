// Websites: one Shopify store per card (connection status, on/off, publishing
// mode) and the editor for each — Connection, Publishing, Routing rules,
// Pricing, Tags, Content & AI. Spec: docs/playbook/product-directory-spec.md.
import { useCallback, useEffect, useRef, useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useBackClose } from '../../hooks/useBackClose';
import Empty from '../../components/ui/Empty';
import type { AddToast } from '../components/PbToasts';
import type { PbWebsite } from '../types';
import { listWebsites } from '../data/websites';
import { listVendorsLite, getPbSettingsLite, type VendorLite } from '../data/products';
import WebsiteCard from '../components/website/WebsiteCard';
import AddWebsiteModal from '../components/website/AddWebsiteModal';
import WebsiteEditor, { type Draft } from '../components/website/WebsiteEditor';

export default function Websites({ addToast }: { addToast: AddToast }) {
  const [sites, setSites] = useState<PbWebsite[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // Unsaved editor drafts by site id: the device Back button closes the editor
  // without its confirm, so the draft is kept here and restored on reopen.
  const drafts = useRef(new Map<string, Draft>());
  const onDraft = useCallback((id: string, d: Draft | null) => { if (d) drafts.current.set(id, d); else drafts.current.delete(id); }, []);

  useBackClose(!!openId, () => {
    if (openId && drafts.current.has(openId)) addToast('Unsaved changes kept — open the website again to save or discard them', 'info');
    setOpenId(null);
  });

  const load = useCallback(async () => {
    try { setSites(await listWebsites()); } catch (e) { addToast(friendlyError(e), 'error'); } finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    Promise.all([listVendorsLite(), getPbSettingsLite()])
      .then(([v, s]) => { setVendors(v); setCategories(s.categories); })
      .catch(e => addToast(friendlyError(e), 'error'));
  }, [addToast]);

  const onSaved = useCallback((w: PbWebsite) => setSites(list => list.map(x => (x.id === w.id ? w : x))), []);
  const open = sites.find(s => s.id === openId);

  return (
    <>
      {open && (
        <WebsiteEditor key={open.id} site={open} initialDraft={drafts.current.get(open.id)} onDraft={onDraft} onClose={() => setOpenId(null)} onSaved={onSaved}
          addToast={addToast} vendors={vendors} categories={categories} />
      )}
      <div style={{ display: open ? 'none' : 'block' }}>
        <div style={{ ...S.flexBetween, gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: T.sora, fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>Websites</div>
            <div style={{ fontSize: 12, color: T.tx3, marginTop: 4 }}>Your Shopify stores — what goes to each, at what price, in which words</div>
          </div>
          <button type="button" onClick={() => setAdding(true)} style={{ ...S.btnPrimary, minHeight: 44 }}>+ Add website</button>
        </div>
        {loading ? (
          <div style={S.emptyState}>Loading websites…</div>
        ) : sites.length === 0 ? (
          <Empty icon="tag" title="No websites yet" cta="Add website" onCta={() => setAdding(true)}
            message="Add a Shopify store, connect it, then set which products go there and at what price. Nothing is sent until you switch it on." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
            {sites.map(s => <WebsiteCard key={s.id} site={s} onOpen={() => setOpenId(s.id)} />)}
          </div>
        )}
      </div>
      <AddWebsiteModal open={adding} onClose={() => setAdding(false)} addToast={addToast}
        onCreated={w => { setSites(list => [...list, w].sort((a, b) => a.name.localeCompare(b.name))); setOpenId(w.id); }} />
    </>
  );
}

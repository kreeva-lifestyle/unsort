// Price Projector (Minis) — every costing sheet with its cost/pc, price,
// margin and threshold status; tap one to project and tune it.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { useProductCatalog, resolveSku } from '../../../hooks/useProductCatalog';
import { useBackClose } from '../../../hooks/useBackClose';
import { SkeletonRows } from '../../ui/Skeleton';
import Empty from '../../ui/Empty';
import { money } from '../costing/costingModel';
import { loadPricingConfig, PricingConfig, emptyConfig } from './pricingConfig';
import { useSettingsCategories } from '../costing/useSettingsCategories';
import { PricedProduct, project } from './pricingModel';
import ProjectorSheet from './ProjectorSheet';

const COLS = 'id, sku, image_url, maintenance_pct, components, notes, selling_price, category, pricing, updated_at';
const DOT: Record<string, string> = { ok: T.gr, below_margin: T.re, over_cost: T.re, no_price: T.yl };

export default function PriceProjector({ addToast, navigateTo, onHome }: { addToast: (m: string, t?: string) => void; navigateTo?: (tab: string) => void; onHome: () => void }) {
  const [list, setList] = useState<PricedProduct[] | null>(null);
  const [config, setConfig] = useState<PricingConfig>(emptyConfig());
  const [open, setOpen] = useState<PricedProduct | null>(null);
  const [search, setSearch] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const { index } = useProductCatalog();
  const { categories } = useSettingsCategories(addToast);
  // One back control for the whole tool: a sheet goes back to the list, the
  // list goes back to Minis. The phone's back gesture follows the same order.
  useBackClose(!!open, () => setOpen(null));
  const backArrow = (
    <button type="button" onClick={() => (open ? setOpen(null) : onHome())} style={{ ...S.btnGhost, padding: '6px 10px', minHeight: 36 }} aria-label={open ? 'Back to list' : 'Back to Minis'}>
      <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const }}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
    </button>
  );

  useEffect(() => {
    loadPricingConfig().then(({ config: c, error }) => { if (error) addToast('Pricing settings failed to load — ' + friendlyError(error), 'error'); setConfig(c); });
    supabase.from('costing_products').select(COLS).order('updated_at', { ascending: false }).limit(500)
      .then(({ data, error }) => { if (error) { addToast(friendlyError(error), 'error'); setList([]); return; } setList((data ?? []) as PricedProduct[]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catalogOf = (sku: string) => resolveSku(index, sku)?.product ?? null;
  const rows = useMemo(() => (list ?? []).map(p => {
    const cat = catalogOf(p.sku);
    const price = cat?.price_exc_gst != null ? Number(cat.price_exc_gst) : null;
    const withCat = p.category ? p : { ...p, category: cat?.category || null };
    return { p: withCat, pr: project(withCat, config, price), catalogPrice: price, catalogCategory: cat?.category || null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [list, config, index]);

  if (open) {
    const r = rows.find(x => x.p.id === open.id);
    return <ProjectorSheet product={r?.p || open} config={config} catalogPrice={r?.catalogPrice ?? null} catalogCategory={r?.catalogCategory ?? null} categories={categories} addToast={addToast}
      backSlot={backArrow} onSaved={saved => { setList(l => (l ?? []).map(x => (x.id === saved.id ? saved : x))); setOpen(null); }} />;
  }

  const q = search.trim().toUpperCase();
  const shown = rows.filter(r => (!q || r.p.sku.toUpperCase().includes(q) || (r.p.category || '').includes(q)) && (!onlyFlagged || r.pr.status === 'below_margin' || r.pr.status === 'over_cost'));
  const flagged = rows.filter(r => r.pr.status === 'below_margin' || r.pr.status === 'over_cost').length;

  return (
    <div style={{ fontFamily: T.sans, color: T.tx }}>
      {config.stitching.length === 0 && (
        <div style={{ fontSize: 11, color: T.yl, background: 'oklch(0.78 0.18 75 / .08)', border: '1px solid oklch(0.78 0.18 75 / .25)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
          No stitching heads configured — cost/pc is materials only. {navigateTo ? <button type="button" onClick={() => navigateTo('settings')} style={{ background: 'none', border: 'none', color: T.ac2, cursor: 'pointer', font: 'inherit', textDecoration: 'underline', padding: 0 }}>Open Settings → Pricing</button> : 'Add them in Settings → Pricing.'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {backArrow}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU or category…" style={{ ...S.fInput, flex: 1, minWidth: 160 }} />
        <button type="button" className="touch44" onClick={() => setOnlyFlagged(v => !v)} aria-pressed={onlyFlagged} style={{ ...S.btnGhost, minHeight: 36, color: onlyFlagged ? T.re : T.tx2 }}>Below threshold{flagged ? ` (${flagged})` : ''}</button>
      </div>
      {list === null && <SkeletonRows rows={4} />}
      {list !== null && shown.length === 0 && (
        <Empty icon="receipt" title={q || onlyFlagged ? 'Nothing matches' : 'No costing sheets yet'} message={q || onlyFlagged ? 'Try another SKU or clear the filter.' : 'The projector prices products from their costing sheet — cost one first in Minis → Product Costing.'} />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {shown.map(({ p, pr }) => (
          <button type="button" key={p.id} onClick={() => setOpen(p)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left', color: T.tx, font: 'inherit', minHeight: 44 }}>
            <div style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', background: T.s2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {p.image_url ? <img src={p.image_url} alt={p.sku} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 9, color: T.tx3 }}>no photo</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[pr.status], flexShrink: 0 }} /><span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700 }}>{p.sku}</span><span style={{ fontSize: 10, color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.category || ''}</span></div>
              <div style={{ fontSize: 11, color: T.tx2, marginTop: 3, fontFamily: T.mono }}>cost {money(pr.breakdown.costPerPc)}{pr.price !== null ? ` · price ${money(pr.price)}` : ''}</div>
              <div style={{ fontSize: 11, marginTop: 2, color: pr.marginPct === null ? T.tx3 : pr.status === 'ok' ? T.gr : T.re }}>{pr.marginPct === null ? `target ${money(pr.target.exc)}` : `${pr.marginPct.toFixed(1)}% margin · ${money(pr.profitAmount || 0)}/pc`}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

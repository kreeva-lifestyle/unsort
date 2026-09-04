// One product's price projection: cost stack with stitching overrides,
// profit target → suggested price, actual price + margin against the
// threshold, and the suggestions. Saves only the pricing columns of the
// costing row (pricing, selling_price, category). The one components write
// is the explicit "Use ₹x as rate" evidence action, which copies a paid PO
// rate onto the sheet line the owner tapped.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../../../lib/supabase';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import { money, num } from '../costing/costingModel';
import PrintPreview from '../costing/PrintPreview';
import type { PricingConfig } from './pricingConfig';
import { PricedProduct, ProductPricing, project } from './pricingModel';
import { suggestions } from './suggestions';
import { pricingSheetHtml } from './pricingSheet';
import StitchingOverrides from './StitchingOverrides';
import SuggestionsList from './SuggestionsList';
import AiSuggestionsCard from './AiSuggestionsCard';
import { useProjectionFacts } from './useProjectionFacts';
import type { EvidenceAction } from './evidence';
import type { PoLine } from './poLines';

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, marginBottom: 12 };
const rowS: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, color: T.tx2, padding: '5px 0' };
const numIn: React.CSSProperties = { ...S.fInput, width: 110, height: 34, padding: '4px 8px', fontFamily: T.mono, textAlign: 'right' as const };
const STATUS: Record<string, { label: string; color: string }> = { ok: { label: 'Within threshold', color: T.gr }, below_margin: { label: 'Below minimum margin', color: T.re }, over_cost: { label: 'Over maximum cost', color: T.re }, no_price: { label: 'No selling price', color: T.yl } };

export default function ProjectorSheet({ product, config, catalogPrice, catalogCategory, categories, peers, poLines, navigateTo, addToast, backSlot, onSaved, onPatched }: {
  product: PricedProduct; config: PricingConfig; catalogPrice: number | null; catalogCategory: string | null; categories: string[];
  peers: PricedProduct[]; poLines: PoLine[]; navigateTo?: (tab: string) => void;
  addToast: (m: string, t?: string) => void; backSlot: ReactNode; onSaved: (p: PricedProduct) => void;
  /** A sheet line changed on the server (evidence action) — keep the list in sync without closing. */
  onPatched: (p: PricedProduct) => void;
}) {
  const [p, setP] = useState<PricedProduct>({ ...product, pricing: product.pricing || {} });
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  useEffect(() => { if (!product.category && catalogCategory) setP(prev => ({ ...prev, category: catalogCategory })); }, [product.category, catalogCategory]);

  const pr = useMemo(() => project(p, config, catalogPrice), [p, config, catalogPrice]);
  const sugs = useMemo(() => suggestions(p, config, pr), [p, config, pr]);
  const { facts, evidence, hash } = useProjectionFacts(p, pr, config, peers, poLines);
  const setPricing = (patch: Partial<ProductPricing>) => setP(prev => ({ ...prev, pricing: { ...(prev.pricing || {}), ...patch } }));
  const dirty = JSON.stringify({ a: p.pricing, b: p.selling_price, c: p.category }) !== JSON.stringify({ a: product.pricing || {}, b: product.selling_price, c: product.category });
  const b = pr.breakdown; const st = STATUS[pr.status];

  const applyEvidence = async (a: EvidenceAction) => {
    if (a.type === 'open_po') { if (navigateTo) navigateTo('purchaseorders'); else addToast(`PO #${a.po} is in Purchase Orders`, 'info'); return; }
    if (a.type === 'exclude_head') {
      setPricing({ stitching: { ...(p.pricing?.stitching || {}), [a.headId]: { ...((p.pricing?.stitching || {})[a.headId] || {}), enabled: false } } });
      addToast('Head excluded for this product — Save projection to keep it', 'success'); return;
    }
    // use_rate: the selected supplier's rate on that sheet line becomes the paid rate.
    const comps = p.components.map((c, ci) => ci !== a.ci ? c : { ...c, subs: c.subs.map((s, si) => {
      if (si !== a.si) return s;
      const idx = Math.max(0, s.suppliers.findIndex(x => x.selected));
      return { ...s, suppliers: s.suppliers.map((x, xi) => (xi === idx ? { ...x, rate: a.rate } : x)) };
    }) });
    setActionBusy(`use_rate:${a.ci}:${a.si}`);
    const { error } = await supabase.from('costing_products').update({ components: comps, updated_at: new Date().toISOString() }).eq('id', p.id);
    setActionBusy(null);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    const next = { ...p, components: comps, updated_at: new Date().toISOString() };
    setP(next); onPatched(next); addToast(`Rate updated to ${money(a.rate)} on the costing sheet`, 'success');
  };

  const save = async () => {
    if (pr.profit.pct >= 100 || pr.profit.pct < 0) { addToast('Profit % must be 0–99', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('costing_products').update({
      pricing: p.pricing || {}, selling_price: num(p.selling_price) > 0 ? num(p.selling_price) : null, category: (p.category || '').trim() || null, updated_at: new Date().toISOString(),
    }).eq('id', p.id);
    setSaving(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast('Projection saved', 'success'); onSaved(p);
  };

  return (
    <div style={{ fontFamily: T.sans, color: T.tx }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {backSlot}
        <div style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700 }}>{p.sku}</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: st.color }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color }} />{st.label}</span>
      </div>

      <div style={card}>
        <label style={S.fLabel}>Category (from Settings → Categories; drives the threshold)</label>
        <select value={p.category || ''} onChange={e => setP(prev => ({ ...prev, category: e.target.value }))} aria-label="Category" style={{ ...S.fInput, width: '100%', cursor: 'pointer', color: p.category ? T.tx : T.tx3 }}>
          <option value="">Select category…</option>
          {p.category && !categories.includes(p.category) && <option value={p.category}>{p.category}</option>}
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Cost per piece</div>
        <div style={rowS}><span>Fabric{b.fabricMeters ? <span style={{ color: T.tx3 }}> · {b.fabricMeters} m</span> : null}</span><span style={{ fontFamily: T.mono }}>{money(b.fabric)}</span></div>
        <div style={rowS}><span>Material</span><span style={{ fontFamily: T.mono }}>{money(b.material)}</span></div>
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 6 }}>Stitching (from Settings → Pricing)</div>
        <StitchingOverrides breakdown={b} overrides={p.pricing?.stitching} onChange={s => setPricing({ stitching: s })} />
        <div style={{ ...rowS, borderTop: `1px solid ${T.bd}`, marginTop: 4 }}>
          <span>Maintenance {b.maintenancePct}% <span style={{ color: T.tx3 }}>on fabric + material + stitching</span></span>
          <span style={{ fontFamily: T.mono }}>{money(b.maintenance)}</span>
        </div>
        <div style={{ ...rowS, fontSize: 16, fontWeight: 800, color: T.tx, fontFamily: T.sora, borderTop: `1px solid ${T.bd}`, paddingTop: 8 }}><span>Cost / pc</span><span>{money(b.costPerPc)}</span></div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Profit target</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <div><label style={S.fLabel}>Profit %</label><input type="number" min="0" max="99" step="0.5" inputMode="decimal" value={p.pricing?.profit?.pct ?? ''} placeholder={String(config.defaults.profit.pct)} onKeyDown={e => numericKeyDown(e)} onChange={e => setPricing({ profit: { ...(p.pricing?.profit || {}), pct: e.target.value === '' ? null : Number(e.target.value) } })} style={numIn} /></div>
          <div><label style={S.fLabel}>Fixed ₹ / pc</label><input type="number" min="0" step="1" inputMode="decimal" value={p.pricing?.profit?.fixed ?? ''} placeholder={String(config.defaults.profit.fixed)} onKeyDown={e => numericKeyDown(e)} onChange={e => setPricing({ profit: { ...(p.pricing?.profit || {}), fixed: e.target.value === '' ? null : Number(e.target.value) } })} style={numIn} /></div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Suggested price</div>
            <div style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 800, color: T.gr }}>{money(pr.target.exc)} <span style={{ fontSize: 11, color: T.tx3, fontWeight: 500 }}>ex GST</span></div>
            <div style={{ fontSize: 11, color: T.tx2 }}>{money(pr.target.inc)} inc {pr.target.gstPct}% GST</div>
          </div>
          <button type="button" className="touch44" onClick={() => setP(prev => ({ ...prev, selling_price: pr.target.exc }))} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>Use as selling price</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Selling price and margin</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <div><label style={S.fLabel}>Selling price ex GST</label><input type="number" min="0" step="1" inputMode="decimal" value={num(p.selling_price) > 0 ? String(p.selling_price) : ''} placeholder={catalogPrice ? `${catalogPrice} (catalog)` : '—'} onKeyDown={e => numericKeyDown(e)} onChange={e => setP(prev => ({ ...prev, selling_price: e.target.value === '' ? null : Number(e.target.value) }))} style={numIn} /></div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Profit · margin{pr.priceSource === 'catalog' ? ' (catalog price)' : ''}</div>
            <div style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 800, color: pr.profitAmount === null ? T.tx3 : pr.profitAmount >= 0 ? T.gr : T.re }}>{pr.profitAmount === null ? '—' : `${money(pr.profitAmount)} · ${pr.marginPct?.toFixed(1)}%`}</div>
          </div>
        </div>
        <div style={{ ...rowS, marginTop: 8, borderTop: `1px solid ${T.bd}`, paddingTop: 8 }}>
          <span>Threshold <span style={{ color: T.tx3 }}>({pr.threshold.source === 'none' ? 'none set' : pr.threshold.source})</span></span>
          <span style={{ fontFamily: T.mono, fontSize: 11 }}>{pr.threshold.minMarginPct != null ? `min ${pr.threshold.minMarginPct}%` : ''}{pr.threshold.minMarginPct != null && pr.threshold.maxCost != null ? ' · ' : ''}{pr.threshold.maxCost != null ? `max cost ${money(pr.threshold.maxCost)}` : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginTop: 4 }}>
          <div><label style={S.fLabel}>Override min margin %</label><input type="number" min="0" max="99" step="0.5" inputMode="decimal" value={p.pricing?.thresholds?.minMarginPct ?? ''} placeholder="—" onKeyDown={e => numericKeyDown(e)} onChange={e => setPricing({ thresholds: { ...(p.pricing?.thresholds || {}), minMarginPct: e.target.value === '' ? null : Number(e.target.value) } })} style={numIn} /></div>
          <div><label style={S.fLabel}>Override max cost ₹</label><input type="number" min="0" step="1" inputMode="decimal" value={p.pricing?.thresholds?.maxCost ?? ''} placeholder="—" onKeyDown={e => numericKeyDown(e)} onChange={e => setPricing({ thresholds: { ...(p.pricing?.thresholds || {}), maxCost: e.target.value === '' ? null : Number(e.target.value) } })} style={numIn} /></div>
        </div>
      </div>

      <SuggestionsList items={sugs} />
      <AiSuggestionsCard productId={p.id} hash={hash} facts={facts} evidence={evidence} deterministic={sugs.map(s => ({ title: s.title, detail: s.detail }))} addToast={addToast}
        actionBusy={actionBusy} onAction={applyEvidence} />

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setPrintHtml(pricingSheetHtml(p, pr, sugs))} style={{ ...S.btnGhost, minHeight: 44 }}>Print / PDF</button>
        <button type="button" onClick={save} disabled={saving || !dirty} style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving || !dirty ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save projection'}</button>
      </div>
      {printHtml && <PrintPreview title={`Price projection — ${p.sku}`} html={printHtml} onClose={() => setPrintHtml(null)} />}
    </div>
  );
}

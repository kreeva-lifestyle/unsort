// Add / edit one routing rule: include or exclude, the conditions (all given
// ones must match; an empty one is ignored) and an optional price override.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import Toggle from '../../../components/ui/Toggle';
import type { AddToast } from '../PbToasts';
import type { PbRoutingRule, PbRuleConditions } from '../../types';
import type { VendorLite } from '../../data/products';
import { saveRule, type RuleDraft } from '../../data/websites';
import PbModal from '../product/PbModal';
import { ChipsInput, Field, Grid2, NumInput, PickChips, Seg, input44 } from './ui';

const EMPTY: RuleDraft = { name: '', enabled: true, action: 'include', conditions: {}, price_override: null };

/** Drop empty conditions so the stored jsonb says only what matters. */
function cleanConditions(c: PbRuleConditions): PbRuleConditions {
  const out: PbRuleConditions = {};
  if (c.vendor_ids?.length) out.vendor_ids = c.vendor_ids;
  if (c.categories?.length) out.categories = c.categories;
  if (c.fabrics?.length) out.fabrics = c.fabrics;
  if (c.keywords?.length) out.keywords = c.keywords;
  if (c.min_cost != null) out.min_cost = c.min_cost;
  if (c.max_cost != null) out.max_cost = c.max_cost;
  return out;
}

export default function RuleModal({ siteId, rule, nextPosition, vendors, categories, onClose, onSaved, addToast }: {
  siteId: string; rule: PbRoutingRule | null; nextPosition: number; vendors: VendorLite[]; categories: string[];
  onClose: () => void; onSaved: (r: PbRoutingRule) => void; addToast: AddToast;
}) {
  const [d, setD] = useState<RuleDraft>(() => (rule ? { name: rule.name, enabled: rule.enabled, action: rule.action, conditions: { ...rule.conditions }, price_override: rule.price_override } : EMPTY));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const c = d.conditions;
  const putC = (x: Partial<PbRuleConditions>) => setD(v => ({ ...v, conditions: { ...v.conditions, ...x } }));
  const vendorOpts = vendors.filter(v => v.active || c.vendor_ids?.includes(v.id)).map(v => ({ id: v.id, label: v.active ? v.name : `${v.name} (inactive)` }));
  // Categories already on the rule stay pickable even if they left the settings list.
  const catOpts = Array.from(new Set([...categories, ...(c.categories ?? [])])).map(x => ({ id: x, label: x }));

  const save = async () => {
    const name = d.name.trim().replace(/\s+/g, ' ');
    const conditions = cleanConditions(c);
    if (conditions.min_cost != null && conditions.max_cost != null && conditions.min_cost > conditions.max_cost) { setErr('The lowest cost is above the highest cost.'); return; }
    const po = d.action === 'include' && d.price_override ? d.price_override : null;
    setSaving(true); setErr('');
    try {
      const r = await saveRule(siteId, rule?.id ?? null, { ...d, name, conditions, price_override: po }, nextPosition);
      addToast(rule ? 'Rule saved' : 'Rule added', 'success');
      onSaved(r);
    } catch (e) { const m = friendlyError(e); setErr(m); addToast(m, 'error'); setSaving(false); }
  };

  const none = Object.keys(cleanConditions(c)).length === 0;
  return (
    <PbModal open title={rule ? 'Edit rule' : 'Add rule'} onClose={onClose} width={560}>
      <form onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Rule name" htmlFor="pbr-name" hint="For you, e.g. “Rangoli sarees” or “Nothing under ₹500”">
          <input id="pbr-name" value={d.name} onChange={e => setD(v => ({ ...v, name: e.target.value }))} maxLength={80} style={input44} />
        </Field>
        <Field label="When a product matches">
          <Seg label="Rule action" value={d.action} onChange={v => setD(x => ({ ...x, action: v }))} options={[
            { id: 'include', label: 'Send it to this store' }, { id: 'exclude', label: 'Keep it off this store' },
          ]} />
        </Field>
        <div style={{ ...S.fLabel, marginTop: 4, color: T.tx2 }}>Conditions — all that you fill must match</div>
        <Field label="Vendors"><PickChips options={vendorOpts} selected={c.vendor_ids ?? []} onChange={v => putC({ vendor_ids: v })} empty="No vendors yet — add them on the Vendors page." /></Field>
        <Field label="Categories"><PickChips options={catOpts} selected={c.categories ?? []} onChange={v => putC({ categories: v })} empty="No categories — add them in Settings." /></Field>
        <Field label="Fabrics" htmlFor="pbr-fab" hint="Any of these (not case-sensitive)">
          <ChipsInput id="pbr-fab" values={c.fabrics ?? []} onChange={v => putC({ fabrics: v })} placeholder="e.g. Silk" />
        </Field>
        <Grid2>
          <Field label="Cost from ₹" htmlFor="pbr-min"><NumInput id="pbr-min" value={c.min_cost ?? null} max={10000000} placeholder="Any" onChange={v => putC({ min_cost: v })} /></Field>
          <Field label="Cost up to ₹" htmlFor="pbr-max"><NumInput id="pbr-max" value={c.max_cost ?? null} max={10000000} placeholder="Any" onChange={v => putC({ max_cost: v })} /></Field>
        </Grid2>
        <Field label="Keywords" htmlFor="pbr-kw" hint="Any of these words in the name, SKU, details or AI-read attributes">
          <ChipsInput id="pbr-kw" values={c.keywords ?? []} onChange={v => putC({ keywords: v })} placeholder="e.g. bridal" />
        </Field>
        {none && <div style={{ ...S.warningBox, marginBottom: 14 }}>No conditions: this rule matches every product.</div>}

        {d.action === 'include' && (
          <div style={{ ...S.card, padding: 12, marginBottom: 14 }}>
            <div style={{ ...S.flexBetween, gap: 10 }}>
              <span style={{ fontSize: 12, color: T.tx2 }}>Own price for these products (replaces the store's markup and add ₹)</span>
              <Toggle on={!!d.price_override} label="Price override"
                onToggle={() => setD(v => ({ ...v, price_override: v.price_override ? null : { markup_pct: 100, add_flat: 0 } }))} />
            </div>
            {d.price_override && (
              <Grid2>
                <Field label="Markup %" htmlFor="pbr-mk"><NumInput id="pbr-mk" value={d.price_override.markup_pct ?? 0} max={1000} onChange={v => setD(x => ({ ...x, price_override: { ...x.price_override, markup_pct: v ?? 0 } }))} /></Field>
                <Field label="Add ₹" htmlFor="pbr-add"><NumInput id="pbr-add" value={d.price_override.add_flat ?? 0} max={1000000} onChange={v => setD(x => ({ ...x, price_override: { ...x.price_override, add_flat: v ?? 0 } }))} /></Field>
              </Grid2>
            )}
          </div>
        )}
        {err && <div style={{ ...S.errorBox, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
          <button type="submit" style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save rule'}</button>
        </div>
      </form>
    </PbModal>
  );
}

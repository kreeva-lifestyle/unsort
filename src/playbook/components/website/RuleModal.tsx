// Add / edit one routing rule: include or exclude, the conditions (all given
// ones must match; an empty one is ignored) and an optional price override.
// V2: a sheet on phone (one full-width primary in the PbModal footer, outside
// the scrolling body; Cancel is the ×), a centred modal on desktop (Cancel,
// then Save rule). An edited rule is dirty: no scrim tap / swipe-down close,
// and ×, Back or Escape ask "Discard …?" first (PbModal). On phone an existing
// rule's "Delete rule" sits at the end of the body (the row has no Delete there).
import { useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { useConfirm, type ConfirmOptions } from '../../../components/ui/ConfirmModal';
import PbConfirm from '../ui/PbConfirm';
import PbSwitch from '../ui/PbSwitch';
import type { AddToast } from '../PbToasts';
import type { PbRoutingRule, PbRuleConditions } from '../../types';
import type { VendorLite } from '../../data/products';
import { deleteRule, saveRule, type RuleDraft } from '../../data/websites';
import PbModal from '../product/PbModal';
import { PB, pbErrorBox, pbLabel, pbMeta } from '../../pbTheme';
import { useIsPhone } from '../../hooks/useIsPhone';
import { Dot } from '../product/status';
import { PbButton, PbTag } from '../ui';
import { ChipsInput, Field, Grid2, NumInput, PickChips, Seg, input44 } from './ui';

const EMPTY: RuleDraft = { name: '', enabled: true, action: 'include', conditions: {}, price_override: null };

/** The one "Delete this rule?" question (row Delete on desktop, sheet Delete on phone). */
export const deleteRuleAsk = (r: PbRoutingRule): ConfirmOptions => ({
  title: 'Delete this rule?', confirmLabel: 'Delete', danger: true,
  message: `“${r.name || 'Unnamed rule'}” will stop sorting products. Products already listed stay listed.${
    r.price_override ? ' Their own price from this rule is dropped: the next time they are updated or regenerated they get the store\'s normal markup.' : ''}`,
});

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

export default function RuleModal({ siteId, rule, nextPosition, vendors, categories, onClose, onSaved, onDeleted, addToast }: {
  siteId: string; rule: PbRoutingRule | null; nextPosition: number; vendors: VendorLite[]; categories: string[];
  onClose: () => void; onSaved: (r: PbRoutingRule) => void; onDeleted: (r: PbRoutingRule) => void; addToast: AddToast;
}) {
  const [d, setD] = useState<RuleDraft>(() => (rule ? { name: rule.name, enabled: rule.enabled, action: rule.action, conditions: { ...rule.conditions }, price_override: rule.price_override } : EMPTY));
  const [initial] = useState(() => JSON.stringify(d));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  const phone = useIsPhone();
  const { ask, modalProps } = useConfirm();
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

  const remove = async () => {
    if (!rule || !(await ask(deleteRuleAsk(rule)))) return;
    setDeleting(true); setErr('');
    try { await deleteRule(rule); addToast('Rule deleted', 'success'); onDeleted(rule); }
    catch (e) { const m = friendlyError(e); setErr(m); addToast(m, 'error'); setDeleting(false); }
  };

  const none = Object.keys(cleanConditions(c)).length === 0;
  const po = d.price_override;
  const setPo = (x: { markup_pct?: number; add_flat?: number }) => setD(v => ({ ...v, price_override: { ...v.price_override, ...x } }));
  return (
    <>
    <PbModal open title={rule ? 'Edit rule' : 'Add rule'} onClose={onClose} dirty={JSON.stringify(d) !== initial} discardTitle={rule ? 'Discard changes to this rule?' : 'Discard this rule?'}
      footer={
        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
          {!phone && <PbButton onClick={onClose} dim={saving}>Cancel</PbButton>}
          <PbButton kind="primary" type="submit" form="pb-rule-form" block={phone} busy={saving} busyLabel="Saving…" dim={deleting}>Save rule</PbButton>
        </div>
      }>
      <form id="pb-rule-form" onSubmit={e => { e.preventDefault(); void save(); }} style={{ display: 'flex', flexDirection: 'column' }}>
        <Field label="Rule name" htmlFor="pbr-name" hint="For you, e.g. “Rangoli sarees” or “Nothing under ₹500”">
          <input id="pbr-name" value={d.name} onChange={e => setD(v => ({ ...v, name: e.target.value }))} maxLength={80} aria-describedby="pbr-name-hint" className="pb-input" style={input44} />
        </Field>
        <Field label="When a product matches">
          <Seg label="Rule action" value={d.action} onChange={v => setD(x => ({ ...x, action: v }))} options={[
            { id: 'include', label: 'Send it to this store', hint: 'Matching products are listed here' },
            { id: 'exclude', label: 'Keep it off this store', hint: 'Matching products are not listed here' },
          ]} />
        </Field>

        <div style={{ borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16, marginBottom: 16 }}>
          <h3 style={{ ...pbLabel, margin: 0 }}>Conditions</h3>
          <div style={pbMeta}>All that you fill must match; an empty one is ignored.</div>
        </div>
        <Field label="Vendors"><PickChips label="Vendors" options={vendorOpts} selected={c.vendor_ids ?? []} onChange={v => putC({ vendor_ids: v })} empty="No vendors yet — add them on the Vendors page." /></Field>
        <Field label="Categories"><PickChips label="Categories" options={catOpts} selected={c.categories ?? []} onChange={v => putC({ categories: v })} empty="No categories — add them in Settings." /></Field>
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
        {none && (
          <div role="status" style={{ marginBottom: 16, padding: '12px 16px', borderRadius: PB.r.input, background: PB.reviewBg, border: `1px solid ${PB.reviewBd}` }}>
            <Dot color={PB.review} label="No conditions: this rule matches every product." style={{ whiteSpace: 'normal', fontSize: 13, color: PB.tx }} />
          </div>
        )}

        {d.action === 'include' && (
          <div style={{ borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ ...pbLabel, margin: 0 }}>Own price</span>
                <span style={pbMeta}>For these products — replaces the store's markup and add ₹.</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <PbTag>{po ? 'On' : 'Off'}</PbTag>
                <PbSwitch on={!!po} label="Price override"
                  onToggle={() => setD(v => ({ ...v, price_override: v.price_override ? null : { markup_pct: 100, add_flat: 0 } }))} />
              </span>
            </div>
            {po && (
              <div style={{ marginTop: 16 }}>
                <Grid2>
                  <Field label="Markup %" htmlFor="pbr-mk"><NumInput id="pbr-mk" value={po.markup_pct ?? 0} max={1000} onChange={v => setPo({ markup_pct: v ?? 0 })} /></Field>
                  <Field label="Add ₹" htmlFor="pbr-add"><NumInput id="pbr-add" value={po.add_flat ?? 0} max={1000000} onChange={v => setPo({ add_flat: v ?? 0 })} /></Field>
                </Grid2>
              </div>
            )}
          </div>
        )}
        {err && <div role="alert" style={{ ...pbErrorBox, marginBottom: 16, overflowWrap: 'anywhere' }}>{err}</div>}
        {phone && rule && (
          <div style={{ borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16, display: 'flex' }}>
            <PbButton kind="danger" icon="trash" onClick={() => void remove()} busy={deleting} busyLabel="Deleting…" dim={saving}>Delete rule</PbButton>
          </div>
        )}
      </form>
    </PbModal>
    <PbConfirm {...modalProps} />
    </>
  );
}

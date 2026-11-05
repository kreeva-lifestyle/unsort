// Routing: what happens when no rule matches (part of the draft), and the
// ordered rules (saved one by one). The first enabled rule that matches decides.
import { useCallback, useEffect, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import Toggle from '../../../components/ui/Toggle';
import ConfirmModal, { useConfirm } from '../../../components/ui/ConfirmModal';
import Empty from '../../../components/ui/Empty';
import type { AddToast } from '../PbToasts';
import type { PbRoutingRule } from '../../types';
import type { VendorLite } from '../../data/products';
import { deleteRule, listRules, reorderRules, sendMatchingProducts, sentMessage, setRuleEnabled } from '../../data/websites';
import { rupees } from '../product/status';
import RuleModal from './RuleModal';
import { Section, Seg } from './ui';
import type { Draft, SetDraft } from './WebsiteEditor';

function summary(r: PbRoutingRule, vendors: VendorLite[]): string {
  const c = r.conditions || {};
  const parts: string[] = [];
  if (c.vendor_ids?.length) parts.push(`vendor ${c.vendor_ids.map(id => vendors.find(v => v.id === id)?.name ?? 'removed vendor').join(' / ')}`);
  if (c.categories?.length) parts.push(c.categories.join(' / '));
  if (c.fabrics?.length) parts.push(`fabric ${c.fabrics.join(' / ')}`);
  if (c.min_cost != null || c.max_cost != null) parts.push(`cost ${c.min_cost != null ? rupees(c.min_cost) : '₹0'}–${c.max_cost != null ? rupees(c.max_cost) : 'any'}`);
  if (c.keywords?.length) parts.push(`words: ${c.keywords.join(', ')}`);
  return parts.length ? parts.join(' · ') : 'every product';
}

export default function RoutingSection({ siteId, draft, set, addToast, vendors, categories }: {
  siteId: string; draft: Draft; set: SetDraft; addToast: AddToast; vendors: VendorLite[]; categories: string[];
}) {
  const [rules, setRules] = useState<PbRoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<PbRoutingRule | 'new' | null>(null);
  const { ask, modalProps } = useConfirm();

  const load = useCallback(async () => {
    try { setRules(await listRules(siteId)); } catch (e) { addToast(friendlyError(e), 'error'); } finally { setLoading(false); }
  }, [siteId, addToast]);
  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try { await fn(); addToast(ok, 'success'); } catch (e) { addToast(friendlyError(e), 'error'); await load(); } finally { setBusy(''); }
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j], next[i]];
    const renumbered = next.map((r, k) => ({ ...r, position: (k + 1) * 10 }));
    void act(`move-${rules[i].id}`, async () => { await reorderRules(siteId, next); setRules(renumbered); }, 'Order saved');
  };

  const toggle = (r: PbRoutingRule) => void act(`en-${r.id}`, async () => {
    await setRuleEnabled(r, !r.enabled);
    setRules(list => list.map(x => (x.id === r.id ? { ...x, enabled: !r.enabled } : x)));
  }, r.enabled ? 'Rule switched off' : 'Rule switched on');

  const remove = async (r: PbRoutingRule) => {
    const price = r.price_override ? ' Their own price from this rule is dropped: the next time they are updated or regenerated they get the store\'s normal markup.' : '';
    if (!(await ask({ title: 'Delete this rule?', message: `“${r.name || 'Unnamed rule'}” will stop sorting products. Products already listed stay listed.${price}`, confirmLabel: 'Delete', danger: true }))) return;
    void act(`del-${r.id}`, async () => { await deleteRule(r); setRules(list => list.filter(x => x.id !== r.id)); }, 'Rule deleted');
  };

  const send = async () => {
    if (busy) return;
    setBusy('send');
    try { addToast(sentMessage('this website', await sendMatchingProducts(siteId)), 'success'); }
    catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(''); }
  };

  const small = (key: string) => ({ ...S.btnGhost, minHeight: 44, minWidth: 44, padding: '0 10px', pointerEvents: busy ? 'none' as const : 'auto' as const, opacity: busy === key ? 0.5 : 1 });
  const nextPosition = (rules.reduce((m, r) => Math.max(m, r.position), 0) || 0) + 10;

  return (
    <>
      <Section title="When no rule matches" hint="Saved with “Save changes”.">
        <Seg label="Default routing" value={draft.routing_default} onChange={v => set({ routing_default: v })} options={[
          { id: 'none', label: 'Do not list it', hint: 'Safe: only products a rule sends' },
          { id: 'all', label: 'List everything', hint: 'Every product unless a rule keeps it off' },
        ]} />
      </Section>

      <Section title="Rules" hint="Checked top to bottom; the first enabled rule that matches decides. Each change saves at once and applies to products that arrive or are re-routed after it."
        right={<button type="button" onClick={() => setEditing('new')} style={{ ...S.btnPrimary, minHeight: 44 }}>+ Add rule</button>}>
        {loading ? <div style={S.emptyState}>Loading rules…</div> : rules.length === 0 ? (
          <Empty icon="clipboard" title="No rules yet" message={draft.routing_default === 'all' ? 'Every product goes to this store.' : 'Nothing goes to this store until you add a rule (or choose “List everything”).'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules.map((r, i) => (
              <div key={r.id} style={{ border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 12, background: T.glass1, opacity: r.enabled ? 1 : 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: T.mono, fontSize: 11, color: T.tx3, width: 18 }}>{i + 1}</span>
                  <span style={{ ...S.badge, background: r.action === 'include' ? T.gr22 : T.re44, color: r.action === 'include' ? T.gr : T.re }}>{r.action === 'include' ? 'SEND' : 'KEEP OFF'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || 'Unnamed rule'}</span>
                  <span style={{ display: 'inline-flex', pointerEvents: busy ? 'none' : 'auto', opacity: busy === `en-${r.id}` ? 0.5 : 1 }}>
                    <Toggle size="sm" on={r.enabled} onToggle={() => toggle(r)} label={`Rule ${r.name || i + 1} enabled`} />
                  </span>
                </div>
                <div style={{ fontSize: 12, color: T.tx2, margin: '6px 0 8px 26px', lineHeight: 1.5 }}>
                  {summary(r, vendors)}
                  {r.price_override && <span style={{ color: T.yl }}> · own price: +{r.price_override.markup_pct ?? 0}% + {rupees(r.price_override.add_flat ?? 0)}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 26 }}>
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} style={{ ...small(`move-${r.id}`), opacity: i === 0 ? 0.3 : 1 }}>&#8593;</button>
                  <button type="button" aria-label="Move down" disabled={i === rules.length - 1} onClick={() => move(i, 1)} style={{ ...small(`move-${r.id}`), opacity: i === rules.length - 1 ? 0.3 : 1 }}>&#8595;</button>
                  <button type="button" onClick={() => setEditing(r)} style={small(`edit-${r.id}`)}>Edit</button>
                  <button type="button" onClick={() => void remove(r)} style={{ ...small(`del-${r.id}`), ...S.btnDanger, minHeight: 44 }}>{busy === `del-${r.id}` ? 'Deleting…' : 'Delete'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Products already in the directory" hint="Rules apply to products that arrive or are checked again after a change. This sends every Ready product that matches the saved rules (and the saved “When no rule matches” choice) to this website now. The website must be switched on.">
        <button type="button" onClick={() => void send()} style={{ ...S.btnGhost, minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>
          {busy === 'send' ? 'Sending…' : 'Send matching products now'}
        </button>
      </Section>

      {editing && (
        <RuleModal siteId={siteId} rule={editing === 'new' ? null : editing} nextPosition={nextPosition} vendors={vendors} categories={categories}
          addToast={addToast} onClose={() => setEditing(null)}
          onSaved={r => { setRules(list => (list.some(x => x.id === r.id) ? list.map(x => (x.id === r.id ? r : x)) : [...list, r])); setEditing(null); }} />
      )}
      <ConfirmModal {...modalProps} />
    </>
  );
}

// Routing: what happens when no rule matches (part of the draft), and the
// ordered rules (saved one by one). The first enabled rule that matches decides.
// Layout: (Rules 12) / (When no rule matches 6)(Send matching products now 6);
// the pair stacks at 6 columns and on phone.
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { useConfirm } from '../../../components/ui/ConfirmModal';
import PbConfirm from '../ui/PbConfirm';
import type { AddToast } from '../PbToasts';
import type { PbRoutingRule } from '../../types';
import type { VendorLite } from '../../data/products';
import { deleteRule, listRules, reorderRules, sendMatchingProducts, sentMessage, setRuleEnabled } from '../../data/websites';
import { rupees } from '../product/status';
import { PbButton } from '../ui';
import RuleModal, { deleteRuleAsk } from './RuleModal';
import { Section, Seg } from './ui';
import { Cell, SectionGrid } from './sections/SectionGrid';
import RuleRow, { RulesEmpty, RulesError, RulesSkeleton } from './sections/RuleRow';
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
  // A failed load is not "no rules": it shows the error with Try again.
  const [loadErr, setLoadErr] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<PbRoutingRule | 'new' | null>(null);
  const { ask, modalProps } = useConfirm();

  const load = useCallback(async () => {
    try { setRules(await listRules(siteId)); setLoadErr(''); } catch (e) { const m = friendlyError(e); setLoadErr(m); addToast(m, 'error'); } finally { setLoading(false); }
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
    if (!(await ask(deleteRuleAsk(r)))) return;
    void act(`del-${r.id}`, async () => { await deleteRule(r); setRules(list => list.filter(x => x.id !== r.id)); }, 'Rule deleted');
  };

  const send = async () => {
    if (busy) return;
    setBusy('send');
    try { addToast(sentMessage('this website', await sendMatchingProducts(siteId)), 'success'); }
    catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(''); }
  };

  const nextPosition = (rules.reduce((m, r) => Math.max(m, r.position), 0) || 0) + 10;
  const retry = async () => { setRetrying(true); await load(); setRetrying(false); };
  const ownPrice = (r: PbRoutingRule) => (r.price_override ? `+${r.price_override.markup_pct ?? 0}% + ${rupees(r.price_override.add_flat ?? 0)}` : null);

  return (
    <>
      <SectionGrid>
        <Cell>
          <Section title="Rules" hint="Checked top to bottom; the first enabled rule that matches decides. Each change saves at once and applies to products that arrive or are re-routed after it."
            right={<PbButton icon="plus" onClick={() => setEditing('new')}>Add rule</PbButton>}>
            {loading ? <RulesSkeleton /> : loadErr && rules.length === 0 ? <RulesError message={loadErr} onRetry={() => void retry()} busy={retrying} />
              : rules.length === 0 ? <RulesEmpty sendsAll={draft.routing_default === 'all'} /> : (
                <ol aria-label="Routing rules, first match wins" style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0 }}>
                  {rules.map((r, i) => (
                    <RuleRow key={r.id} rule={r} index={i} count={rules.length} summary={summary(r, vendors)} price={ownPrice(r)} busy={busy}
                      onMove={dir => move(i, dir)} onToggle={() => toggle(r)} onEdit={() => setEditing(r)} onDelete={() => void remove(r)} />
                  ))}
                </ol>
              )}
          </Section>
        </Cell>

        <Cell span={6}>
          <Section title="When no rule matches" hint="Saved with “Save changes”.">
            <Seg label="Default routing" value={draft.routing_default} onChange={v => set({ routing_default: v })} options={[
              { id: 'none', label: 'Do not list it', hint: 'Safe: only products a rule sends' },
              { id: 'all', label: 'List everything', hint: 'Every product unless a rule keeps it off' },
            ]} />
          </Section>
        </Cell>
        <Cell span={6}>
          <Section title="Products already in the directory" hint="Rules apply to products that arrive or are checked again after a change. This sends every Ready product that matches the saved rules (and the saved “When no rule matches” choice) to this website now. The website must be switched on.">
            <PbButton icon="arrowUpRight" onClick={() => void send()} busy={busy === 'send'} busyLabel="Sending…" style={busy && busy !== 'send' ? { pointerEvents: 'none', opacity: 0.5 } : undefined}>
              Send matching products now
            </PbButton>
          </Section>
        </Cell>
      </SectionGrid>

      {editing && (
        <RuleModal siteId={siteId} rule={editing === 'new' ? null : editing} nextPosition={nextPosition} vendors={vendors} categories={categories}
          addToast={addToast} onClose={() => setEditing(null)}
          onSaved={r => { setRules(list => (list.some(x => x.id === r.id) ? list.map(x => (x.id === r.id ? r : x)) : [...list, r])); setEditing(null); }}
          onDeleted={r => { setRules(list => list.filter(x => x.id !== r.id)); setEditing(null); }} />
      )}
      <PbConfirm {...modalProps} />
    </>
  );
}

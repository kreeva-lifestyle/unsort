// One category's sheet: the attributes it uses, in order (up / down / remove,
// each saved at once), and "+ <attribute>" chips to link more. Every linked
// attribute is REQUIRED ("for each attribute of its category a tag is a
// must"), so linking first counts the products that lack it and asks:
// "12 products will need a Colour" → Link and let AI decide (the sheet's one
// gradient: links, then queues those products for the AI) / Link only /
// Cancel. Removing the category from the list lives at the bottom. An attribute
// whose values depend on the category (Product Type) says how many of its values
// are ticked for this category — none means its products cannot be finished.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { TagsApi } from '../../data/tags';
import { offeredFor, type PbAttribute, type PbCategoryLink, type PbLinkStat } from '../../tagTypes';
import { PB, pbBody, pbMeta, pbName, pbTileReview } from '../../pbTheme';
import { useConfirm } from '../../../components/ui/ConfirmModal';
import PbModal from '../product/PbModal';
import { PbButton, PbConfirm } from '../ui';
import { Dot } from '../product/status';
import { plural } from './tagText';

export default function CategorySheet({ category, attrs, links, stats, api, addToast, onClose, onChanged, onRemove, canEdit }: {
  category: string | null; attrs: PbAttribute[]; links: PbCategoryLink[]; stats: PbLinkStat[]; api: TagsApi; addToast: AddToast;
  onClose: () => void; onChanged: () => void; onRemove: (c: string) => Promise<void>; canEdit: boolean;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [ask0, setAsk0] = useState<{ attr: PbAttribute; lacking: number } | null>(null);
  const { ask, modalProps } = useConfirm();
  const cat = category ?? '';
  useEffect(() => {
    setIds(links.filter(l => l.category.toLowerCase() === cat.toLowerCase()).sort((a, b) => a.position - b.position).map(l => l.attribute_id));
    setAsk0(null);
  }, [cat, links]);
  if (!category) return null;
  const linked = ids.map(id => attrs.find(a => a.id === id)).filter((a): a is PbAttribute => !!a);
  const free = attrs.filter(a => !ids.includes(a.id));
  const lacking = (id: string) => stats.find(s => s.category.toLowerCase() === cat.toLowerCase() && s.attribute_id === id)?.lacking ?? 0;
  /** An attribute whose values depend on the category: how many are ticked for this one (null for the others). */
  const here = (a: PbAttribute) => (a.by_category ? a.values.filter(v => offeredFor(a, v, cat)).length : null);

  const save = async (next: string[], key: string, ok: (r: { to_needs_info: number; to_ready: number }) => string) => {
    setBusy(key);
    try { const r = await api.saveLinks(category, next); setIds(next); addToast(ok(r), 'success'); onChanged(); return true; }
    catch (e) { addToast(friendlyError(e), 'error'); return false; } finally { setBusy(''); }
  };
  const move = (i: number, d: -1 | 1) => { const n = [...ids]; [n[i], n[i + d]] = [n[i + d], n[i]]; void save(n, `move:${ids[i]}`, () => 'Order saved'); };
  const unlink = (a: PbAttribute) => void save(ids.filter(x => x !== a.id), `rm:${a.id}`, r => `${category} no longer needs ${a.name}${r.to_ready ? ` — ${plural(r.to_ready, 'product')} ready again` : ''}`);
  const start = async (a: PbAttribute) => {
    setBusy(`add:${a.id}`);
    try {
      const n = await api.linkCheck(category, a.id);
      if (n > 0) setAsk0({ attr: a, lacking: n });
      else await save([...ids, a.id], `add:${a.id}`, () => `${category} now uses ${a.name}`);
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(b => (b === `add:${a.id}` ? '' : b)); }
  };
  const link = async (ai: boolean) => {
    if (!ask0) return;
    const { attr: a, lacking: n } = ask0;
    const ok = await save([...ids, a.id], ai ? 'link-ai' : 'link', r => `${category} now needs ${a.name} — ${plural(r.to_needs_info, 'product')} wait in Needs info`);
    if (!ok) return;
    setAsk0(null);
    if (!ai) return;
    try {
      const q = await api.aiFill({ category, attribute_id: a.id });
      // q can be fewer than the products lacking it (n), or none: the AI leaves products whose tags a person chose.
      if (q) addToast(`AI is choosing a ${a.name} for ${plural(q, 'product')} — they move to Ready as it goes`, 'success');
      else addToast(`The AI took none of the ${plural(n, 'product')}: they already wait for it, or their tags were chosen by hand. Choose ${a.name} on those yourself.`, 'info');
      onChanged();
    }
    catch (e) { addToast(friendlyError(e), 'error'); }
  };
  const remove = async () => {
    if (!await ask({ title: `Remove ${category}?`, message: 'The AI stops picking it for new products. Products already in it keep it; it stops needing its attributes.', confirmLabel: 'Remove', danger: true })) return;
    setBusy('remove');
    try { await onRemove(category); onClose(); } finally { setBusy(''); }
  };
  return (
    <PbModal open title={category} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
        <p style={{ ...pbBody, color: PB.tx2, margin: 0 }}>Every product in {category} needs a value for each attribute here before it can go to websites. Playbook fills them from the text first, then the AI.</p>
        <ol aria-label={`Attributes ${category} uses`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {linked.map((a, i) => (
            <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '4px 0', borderTop: i ? `1px solid ${PB.tileBd}` : 'none' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...pbName, display: 'block' }}>{a.name}</span>
                <span style={pbMeta}>{lacking(a.id) ? `${plural(lacking(a.id), 'product')} still need one` : 'Every product has one'}</span>
                {here(a) === 0 && <Dot color={PB.review} label={`No ${a.name} value is ticked for ${category} yet: open one under Attributes and tick ${category}`} style={{ ...pbMeta, color: PB.tx, whiteSpace: 'normal', display: 'flex' }} />}
                {!!here(a) && <span style={{ ...pbMeta, display: 'block' }}>{plural(here(a) ?? 0, `${a.name} value`)} for {category}</span>}
              </span>
              {canEdit && <>
                <PbButton iconOnly icon="chevronUp" aria-label={`Move ${a.name} up`} onClick={() => move(i, -1)} disabled={i === 0} dim={!!busy} />
                <PbButton iconOnly icon="chevronDown" aria-label={`Move ${a.name} down`} onClick={() => move(i, 1)} disabled={i === linked.length - 1} dim={!!busy} />
                <PbButton iconOnly icon="x" aria-label={`Stop using ${a.name} in ${category}`} onClick={() => unlink(a)} busy={busy === `rm:${a.id}`} dim={!!busy && busy !== `rm:${a.id}`} />
              </>}
            </li>
          ))}
          {!linked.length && <li style={{ ...pbMeta, color: PB.tx2 }}>No attributes yet — products in {category} need no tags to be ready.</li>}
        </ol>
        {ask0 && (
          <div role="alertdialog" aria-labelledby="pbc-warn" style={{ ...pbTileReview, backdropFilter: 'none', WebkitBackdropFilter: 'none', borderRadius: PB.r.input, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Dot color={PB.review} label={<span id="pbc-warn">{plural(ask0.lacking, 'product')} will need a {ask0.attr.name}</span>} style={{ color: PB.tx, fontWeight: 600, fontSize: 13, whiteSpace: 'normal' }} />
            <span style={pbBody}>Until they have one they wait in Needs info and are not sent to websites. The AI can choose one from your {ask0.attr.name} list for each.
              {here(ask0.attr) === 0 && <> But no {ask0.attr.name} value is ticked for {category} yet: tick some first, or nothing can be chosen.</>}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <PbButton kind="primary" icon="sparkles" onClick={() => void link(true)} busy={busy === 'link-ai'} busyLabel="Linking…" dim={busy === 'link'}>Link and let AI decide</PbButton>
              <PbButton onClick={() => void link(false)} busy={busy === 'link'} busyLabel="Linking…" dim={busy === 'link-ai'}>Link only</PbButton>
              <PbButton onClick={() => setAsk0(null)} dim={!!busy}>Cancel</PbButton>
            </div>
          </div>
        )}
        {canEdit && free.length > 0 && !ask0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={pbMeta}>Add an attribute</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {free.map(a => <PbButton key={a.id} icon="plus" onClick={() => void start(a)} busy={busy === `add:${a.id}`} busyLabel="Checking…" dim={!!busy && busy !== `add:${a.id}`}>{a.name}</PbButton>)}
            </div>
          </div>
        )}
        {canEdit && (
          <div style={{ borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <PbButton kind="danger" icon="trash" onClick={() => void remove()} busy={busy === 'remove'} busyLabel="Removing…" dim={!!busy && busy !== 'remove'}>Remove category</PbButton>
            <span style={{ ...pbBody, color: PB.tx2 }}>Asks first.</span>
          </div>
        )}
      </div>
      <PbConfirm {...modalProps} />
    </PbModal>
  );
}

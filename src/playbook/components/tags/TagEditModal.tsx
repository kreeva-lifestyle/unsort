// Edit one tag (rename, change its kind, or merge it into another tag) or
// merge several selected tags into one. A sheet on phone, a modal on desktop
// (PbModal). The merge target comes from a search of the library; the chosen
// one shows as a chip. Save is the sheet's one primary; the tile runs the
// calls and shows the toast. The form resets every time it opens.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { PB, pbActive, pbBtnSecondary, pbErrorBox, pbInput, pbMeta, pbNum } from '../../pbTheme';
import { TAG_KINDS, type PbTagKind } from '../../tagTypes';
import { useIsPhone } from '../../hooks/useIsPhone';
import type { TagSuggestion } from '../../data/tags';
import PbModal from '../product/PbModal';
import { PbButton, PbIcon, PbTag } from '../ui';
import { Field } from '../website/ui';
import type { TagRowData } from './TagRow';
import { kindLabel } from './tagText';

export type TagEdit = { name?: string; kind?: PbTagKind; into?: TagSuggestion };

export default function TagEditModal({ open, tag, count, suggest, onClose, onSave, saving }: {
  open: boolean;
  /** The tag being edited; null = merge the `count` selected tags into one. */
  tag: TagRowData | null; count?: number;
  suggest: (q: string) => Promise<TagSuggestion[]>;
  onClose: () => void; onSave: (e: TagEdit) => void; saving: boolean;
}) {
  const phone = useIsPhone();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PbTagKind>('other');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<TagSuggestion[]>([]);
  const [into, setInto] = useState<TagSuggestion | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setName(tag?.name ?? ''); setKind(tag?.kind ?? 'other'); setQ(''); setHits([]); setInto(null); setErr(''); } }, [open, tag]);
  useEffect(() => {
    if (!open || !q.trim()) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => suggest(q).then(r => { if (live) setHits(r.filter(h => h.id !== tag?.id)); }).catch(e => { if (live) setErr(friendlyError(e)); }), 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, open, suggest, tag]);

  const bulk = !tag;
  const nm = name.trim().replace(/\s+/g, ' ');
  const dirty = !!into || (!bulk && (nm !== tag.name || kind !== tag.kind));
  const save = () => {
    if (!bulk && !into && !nm) { setErr('Give the tag a name, or merge it into another tag.'); return; }
    if (bulk && !into) { setErr('Pick the tag to merge into.'); return; }
    if (!dirty) { onClose(); return; }
    onSave({ into: into ?? undefined, name: !into && nm !== tag?.name ? nm : undefined, kind: !into && kind !== tag?.kind ? kind : undefined });
  };
  const footer = (
    <div style={{ display: 'flex', flexDirection: phone ? 'column' : 'row', justifyContent: 'flex-end', gap: phone ? 12 : 16 }}>
      {!phone && <PbButton onClick={onClose} dim={saving}>Cancel</PbButton>}
      {/* Gradient only once there is something to save: a greyed-out gradient reads as broken; disabled, it says why. */}
      <PbButton kind={dirty ? 'primary' : 'secondary'} block={phone} onClick={save} busy={saving} busyLabel="Saving…" disabled={!dirty} aria-disabled={!dirty}>
        {into ? `Merge into ${into.name}` : bulk ? 'Pick a tag to merge into' : dirty ? 'Save' : 'Nothing changed yet'}
      </PbButton>
    </div>
  );
  return (
    <PbModal open={open} title={bulk ? `Merge ${count ?? 0} tags into…` : `Edit tag: ${tag.name}`} onClose={onClose} footer={footer} dirty={dirty && !saving} discardTitle="Discard these changes?">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8 }}>
        {!bulk && !into && (
          <>
            <Field label="Name" htmlFor="pbtag-name" hint="Renaming changes the tag on every product that carries it.">
              <input id="pbtag-name" value={name} onChange={e => setName(e.target.value)} maxLength={255} className="pb-input" style={pbInput} />
            </Field>
            <Field label="Kind" htmlFor="pbtag-kind">
              <select id="pbtag-kind" value={kind} onChange={e => setKind(e.target.value as PbTagKind)} className="pb-input" style={pbInput}>
                {TAG_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label={bulk ? 'Merge into' : 'Or merge into another tag'} htmlFor="pbtag-into"
          hint={into ? `${bulk ? 'The selected tags become' : 'This tag becomes'} another name for ${into.name}: products get that name instead, and new arrivals are renamed by themselves.` : 'Search the library. The tag you pick is the one that stays.'}>
          {into ? (
            <button type="button" onClick={() => setInto(null)} aria-label={`Remove ${into.name}`} className="pb-pill"
              style={{ ...pbBtnSecondary, ...pbActive, borderRadius: PB.r.pill, gap: 8 }}>
              {into.name}<PbIcon name="x" size={16} />
            </button>
          ) : (
            <input id="pbtag-into" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Kurta Set" className="pb-input" style={pbInput} autoCapitalize="words" />
          )}
        </Field>
        {!into && hits.length > 0 && (
          <ul aria-label="Matching tags" style={{ listStyle: 'none', margin: '-8px 0 8px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {hits.map(h => (
              <li key={h.id}>
                <button type="button" onClick={() => { setInto(h); setQ(''); }} className="pb-pill"
                  style={{ ...pbBtnSecondary, width: '100%', justifyContent: 'space-between', borderRadius: PB.r.input, fontWeight: 500, whiteSpace: 'normal', textAlign: 'left' }}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{h.name}{h.hidden ? <span style={{ ...pbMeta, marginLeft: 8 }}>hidden</span> : null}</span>
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexShrink: 0 }}><PbTag>{kindLabel(h.kind)}</PbTag><span style={{ ...pbNum, ...pbMeta }}>{h.uses}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!into && q.trim() && !hits.length && <div style={{ ...pbMeta, marginTop: -8, marginBottom: 8 }}>No other tag matches “{q.trim()}”.</div>}
        {err && <div role="alert" style={pbErrorBox}>{err}</div>}
      </div>
    </PbModal>
  );
}

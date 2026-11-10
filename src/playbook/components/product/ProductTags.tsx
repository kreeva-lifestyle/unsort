// The product's own tags, inside the Facts tile: chips you can remove, an
// input with suggestions from the tag library (hidden ones marked), the
// count, and its own Save tags (secondary: Save facts is the tile's
// gradient). Saving goes through set_product_tags: the server cleans the
// list, applies library aliases, saves, and locks 'tags' so the AI adds to
// it but never replaces it (the "Kept" mark). Not a <form>: it sits inside
// the Facts form, so Enter in the box adds a tag and never submits the facts.
// A reload of the product (Save facts, a read) refreshes the chips only while
// they are clean: typed tags survive a facts save.
import { useEffect, useRef, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { PbProduct } from '../../types';
import { setProductTags, suggestTags, type TagSuggestion } from '../../data/tags';
import { PB, pbBtnSecondary, pbErrorBox, pbInput, pbLabel, pbMeta, pbNum } from '../../pbTheme';
import { useDirty } from '../../hooks/useDirty';
import PbButton from '../ui/PbButton';
import PbIcon from '../ui/PbIcon';
import { KeptTag } from './detail/ListingField';
import { hiddenWhy } from '../tags/tagText';

const MAX = 100;
const NONE: string[] = [];
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

export default function ProductTags({ product, addToast, onSaved, suggest = suggestTags, save = setProductTags }: {
  product: Pick<PbProduct, 'id' | 'tags' | 'locked' | 'status'>; addToast: AddToast; onSaved: () => void;
  suggest?: typeof suggestTags; save?: typeof setProductTags;
}) {
  const orig = product.tags ?? NONE;
  const [tags, setTags] = useState<string[]>(orig);
  const [text, setText] = useState('');
  const [hits, setHits] = useState<TagSuggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const dirty = !sameList(tags, orig);
  const reading = product.status === 'reading';
  useDirty(dirty && !saving, 'Discard changes to the tags?');
  // The server's list changed (a facts save, a read): take it unless the chips hold unsaved typing.
  const prev = useRef(orig);
  useEffect(() => { const was = prev.current; prev.current = orig; setTags(cur => (sameList(cur, was) ? orig : cur)); }, [orig]);

  useEffect(() => {
    if (!text.trim()) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => suggest(text).then(r => { if (live) setHits(r.filter(h => !tags.some(x => key(x) === key(h.name)))); }).catch(() => { if (live) setHits([]); }), 250);
    return () => { live = false; clearTimeout(t); };
  }, [text, suggest, tags]);

  const add = (raw: string) => {
    const parts = raw.split(/[\n,]/).map(x => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (!parts.length) return;
    setTags(cur => {
      const out = [...cur];
      for (const p of parts) if (!out.some(o => key(o) === key(p)) && out.length < MAX) out.push(p.slice(0, 255));
      return out;
    });
    setText(''); setErr('');
  };
  const doSave = async () => {
    if (saving || !dirty || reading) return;
    setSaving(true); setErr('');
    try {
      const r = await save(product.id, tags);
      setTags(r.tags); // the cleaned list, so the chips match the product the reload brings back
      const dropped = r.hidden.filter(h => h.reason !== 'duplicate');
      const flagged = r.flagged.length ? ` ${r.flagged.length} of them ${r.flagged.length === 1 ? 'is' : 'are'} hidden from websites (Settings → Tags): ${r.flagged.slice(0, 3).join(', ')}.` : '';
      addToast(dropped.length
        ? `Saved ${r.tags.length} tags — ${dropped.length} left out: ${dropped.slice(0, 3).map(h => `${h.tag} (${hiddenWhy(h)})`).join(', ')}${dropped.length > 3 ? '…' : ''}.${flagged}`
        : `Saved ${r.tags.length} ${r.tags.length === 1 ? 'tag' : 'tags'}.${flagged}`, dropped.length || flagged ? 'info' : 'success');
      onSaved();
    } catch (e) { setErr(friendlyError(e)); } finally { setSaving(false); }
  };
  const chip = { ...pbBtnSecondary, minHeight: 'var(--pb-chip-h)', padding: '0 14px', borderRadius: PB.r.pill, fontWeight: 500, gap: 6 } as const;

  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16, marginTop: 8 }}>
      <label htmlFor="pb-f-tags" style={{ ...pbLabel, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 0 }}>
        Tags <span style={{ ...pbNum, textTransform: 'none', letterSpacing: 0 }}>· {tags.length}</span>
        {product.locked.includes('tags') && <KeptTag hint="Edited by hand. The AI adds tags but never replaces these." />}
      </label>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tags.map(t => (
            <button key={t} type="button" aria-label={`Remove ${t}`} onClick={() => setTags(tags.filter(x => x !== t))} className="pb-pill" style={chip} disabled={saving}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{t}</span>
              <span style={{ color: PB.tx3, display: 'inline-flex' }}><PbIcon name="x" size={16} /></span>
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input id="pb-f-tags" value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Festive — Enter adds it" disabled={reading}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }} autoCapitalize="words" className="pb-input" style={pbInput} />
        <button type="button" onClick={() => add(text)} disabled={!text.trim()} className="pb-pill" style={{ ...pbBtnSecondary, flexShrink: 0, ...(text.trim() ? null : { opacity: 0.5, cursor: 'not-allowed' }) }}>Add</button>
      </div>
      {hits.length > 0 && (
        <div role="group" aria-label="Tags from the library" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {hits.map(h => (
            <button key={h.id} type="button" onClick={() => add(h.name)} className="pb-pill" style={{ ...chip, ...(h.hidden ? { textDecoration: 'line-through', color: PB.tx2 } : null) }}
              title={h.hidden ? 'Hidden from websites in Settings → Tags' : undefined}>
              <PbIcon name="plus" size={16} />{h.name}{h.hidden && <span style={{ ...pbMeta, textDecoration: 'none' }}>hidden</span>}
            </button>
          ))}
        </div>
      )}
      <span style={pbMeta}>Built from the facts, the other store's tags and the AI; junk is left out by the rules in Settings → Tags. Websites send these with the <span style={pbNum}>{'{tags}'}</span> placeholder.</span>
      {err && <div role="alert" style={pbErrorBox}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
        {dirty && <PbButton onClick={() => { setTags(orig); setErr(''); }} dim={saving}>Discard tag changes</PbButton>}
        <PbButton onClick={() => void doSave()} disabled={!dirty || reading} busy={saving} busyLabel="Saving…">Save tags</PbButton>
      </div>
    </div>
  );
}

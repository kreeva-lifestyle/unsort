// "+ Add value" under an attribute: a field with a live look-alike check as
// you type (debounced value_check; the closest match shows under the field),
// then Add. A close match opens the guard (LookAlikeModal): "same thing" files
// the word as "also known as" of that value, "it's different" adds it anyway.
// Enter adds. Two signals: "Adding…" on the button, then a toast. `onAdded`: the new value, for an attribute whose
// values depend on the category (its sheet opens at once, to tick the categories).
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { logSwallowed } from '../../../lib/errorLogger';
import type { AddToast } from '../PbToasts';
import { LookAlikeError, type TagsApi } from '../../data/tags';
import type { PbAttrValue, PbAttribute, PbLookAlike } from '../../tagTypes';
import { PB, pbInput, pbMeta } from '../../pbTheme';
import { PbButton } from '../ui';
import { Dot } from '../product/status';
import LookAlikeModal from './LookAlikeModal';
import { lookSentence } from './tagText';
import { useAliasInto } from './useAliasInto';

export default function AddValueField({ attr, attrs, api, addToast, onSaved, onAdded, disabled }: {
  attr: PbAttribute; attrs: PbAttribute[]; api: TagsApi; addToast: AddToast; onSaved: () => void; onAdded?: (v: PbAttrValue) => void; disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [hint, setHint] = useState<{ matches: PbLookAlike[]; exists: { name: string } | null } | null>(null);
  const [busy, setBusy] = useState<'' | 'add' | 'same' | 'new'>('');
  const [guard, setGuard] = useState<PbLookAlike[] | null>(null);
  const aliasInto = useAliasInto(attrs, api);
  const name = text.trim().replace(/\s+/g, ' ');
  const id = `pbv-add-${attr.id}`;

  useEffect(() => {
    if (name.length < 2) { setHint(null); return; }
    let live = true;
    const t = setTimeout(() => api.checkValue(attr.id, name).then(r => { if (live) setHint(r); }).catch(e => { logSwallowed('value_check', e); if (live) setHint(null); }), 400);
    return () => { live = false; clearTimeout(t); };
  }, [name, attr.id, api]);

  const done = (msg: string) => { addToast(msg, 'success'); setText(''); setHint(null); setGuard(null); onSaved(); };
  const save = async (force: boolean) => {
    setBusy(force ? 'new' : 'add');
    try {
      const v = await api.saveValue({ attribute_id: attr.id, name, force });
      done(`Added “${name}” to ${attr.name}${onAdded ? ' — now tick its categories' : ''}`);
      onAdded?.({ ...v, uses: 0 });
    }
    catch (e) { if (e instanceof LookAlikeError) setGuard(e.matches); else addToast(friendlyError(e), 'error'); }
    finally { setBusy(''); }
  };
  const add = () => {
    if (!name || busy) return;
    if (hint?.exists) { addToast(`“${hint.exists.name}” is already in ${attr.name}.`, 'info'); return; }
    const close = hint?.matches.filter(m => m.reason !== 'same' || m.other_attribute) ?? [];
    if (close.length) { setGuard(close); return; }
    void save(false);
  };
  const same = async (m: PbLookAlike) => {
    setBusy('same');
    try { await aliasInto(m, name); done(`“${name}” is now also known as ${m.value} (${m.attribute})`); }
    catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(''); }
  };
  const top = hint?.exists ? null : hint?.matches[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <label htmlFor={id} className="pb-sr">Add a value to {attr.name}</label>
      <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
        <input id={id} value={text} onChange={e => setText(e.target.value)} placeholder={`Add a ${attr.name.toLowerCase()} value, e.g. ${attr.values[0]?.name ?? 'Black'}`}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} maxLength={80} autoCapitalize="words" disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined} className="pb-input" style={{ ...pbInput, minWidth: 0 }} />
        <PbButton icon="plus" onClick={add} disabled={!name || disabled} busy={busy === 'add'} busyLabel="Adding…" style={{ flexShrink: 0 }}>Add</PbButton>
      </div>
      <span id={`${id}-hint`} aria-live="polite" style={{ minHeight: 18 }}>
        {hint?.exists && <Dot color={PB.review} label={`Already here: ${hint.exists.name}`} style={{ ...pbMeta, whiteSpace: 'normal' }} />}
        {top && <Dot color={PB.review} label={lookSentence(name, top)} style={{ ...pbMeta, whiteSpace: 'normal' }} />}
      </span>
      <LookAlikeModal open={!!guard} phrase={name} target={attr.name} matches={guard ?? []} busy={busy === 'same' || busy === 'new' ? busy : ''}
        onSame={m => void same(m)} onNew={() => void save(true)} onClose={() => setGuard(null)} />
    </div>
  );
}

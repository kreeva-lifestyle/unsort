// Suggestions (Tags page): phrases Playbook saw that are not values yet —
// store tags, words in posts, the AI's "other" — most seen first, 20 a page,
// filtered by attribute. Each shows its nearest value already in the lists
// (the word rules, else the AI: asked once for the cards not looked at yet,
// by someone who can act on them, and kept); "Same as <value>" files it there.
// "+ Add to <Attribute>" runs the look-alike guard first (LookAlikeModal);
// "Also known as…" files it under a value you choose; Ignore never suggests it
// again. Bulk select: Same as nearest (each into its own nearest value, owner
// 13 Nov) / Add (when all share one attribute) / Ignore, in a bar that sticks
// to the top while the list scrolls.
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { SuggestionAct, TagsApi } from '../../data/tags';
import { UNDO_HINT } from '../../data/websites';
import type { PbAttribute, PbLookAlike, PbSuggestion } from '../../tagTypes';
import { PB, pbErrorBox, pbMeta, pbNum } from '../../pbTheme';
import { PbButton, PbChip, PbChipRow, PbSection, PbTile } from '../ui';
import AliasPicker, { type AliasTarget } from './AliasPicker';
import LookAlikeModal from './LookAlikeModal';
import SuggestionCard from './SuggestionCard';
import TagCheck from './TagCheck';
import { TagRowsSkeleton, TagsEmpty, TagsError } from './TagStates';
import { plural } from './tagText';

export default function SuggestionsTile({ attrs, api, addToast, version, onChanged, canEdit }: { attrs: PbAttribute[]; api: TagsApi; addToast: AddToast; version: number; onChanged: () => void; canEdit: boolean }) {
  const [rows, setRows] = useState<PbSuggestion[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [attr, setAttr] = useState('');
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [guard, setGuard] = useState<{ s: PbSuggestion; matches: PbLookAlike[] } | null>(null);
  const [alias, setAlias] = useState<PbSuggestion | null>(null);
  const [asking, setAsking] = useState(false);
  const [nearErr, setNearErr] = useState('');
  const asked = useRef(0);
  /** The nearest value for the cards not looked at yet: one call, kept on the server, merged in by id.
   *  `byHand`: "Ask again" was tapped, so the end is said in a toast too (on load the cards filling in say it). */
  const askNearest = useCallback(async (list: PbSuggestion[], byHand = false) => {
    const ids = list.filter(r => !r.nearest).map(r => r.id);
    if (!canEdit || !ids.length) return;
    const me = ++asked.current;
    setAsking(true); setNearErr('');
    try {
      const got = await api.nearestSuggestions(ids);
      setRows(rs => rs && rs.map(r => (got[r.id] ? { ...r, nearest: got[r.id] } : r)));
      if (byHand) addToast(`The AI looked at ${plural(Object.keys(got).length, 'suggestion')}`, 'success');
    } catch (e) { if (me === asked.current) setNearErr(friendlyError(e)); }
    finally { if (me === asked.current) setAsking(false); }
  }, [api, canEdit, addToast]);
  const load = useCallback(async () => {
    try {
      const r = await api.listSuggestions('pending', page, attr);
      // The last suggestion of a later page was just handled: step back to the page that still has some.
      if (!r.rows.length && page > 0) { setPage(Math.max(0, Math.ceil(r.count / 20) - 1)); return; }
      setRows(r.rows); setCount(r.count); setErr('');
      void askNearest(r.rows);
    }
    catch (e) { setErr(friendlyError(e)); }
  }, [api, page, attr, askNearest]);
  useEffect(() => { void load(); }, [load, version]);
  useEffect(() => { setSel(new Set()); }, [page, attr, version]);

  /** `hint`: the last part of the success toast (where a bulk change is taken back). */
  const act = async (a: SuggestionAct, key: string, ok: (n: number) => string, hint = '') => {
    setBusy(key);
    try {
      const r = await api.actSuggestions(a);
      const first = Object.entries(r.conflicts)[0];
      if (first) { const s = rows?.find(x => x.id === first[0]); if (s) setGuard({ s, matches: first[1] as PbLookAlike[] }); }
      const left = r.skipped ? `${plural(r.skipped, 'suggestion')} left as ${r.skipped === 1 ? 'it was' : 'they were'}: no nearest value now` : '';
      if (r.done) { addToast([ok(r.done), r.retagged ? `${plural(r.retagged, 'product')} tagged` : '', left, hint].filter(Boolean).join(' · '), 'success'); setSel(new Set()); onChanged(); }
      else if (left) { addToast(`${left[0].toUpperCase()}${left.slice(1)}.`, 'info'); onChanged(); } // the list loads again and shows why
      return first ? 'asked' : true; // 'asked': the server found a look-alike and the question is now open
    } catch (e) { addToast(friendlyError(e), 'error'); return false; } finally { setBusy(''); }
  };
  const nameOf = (id: string | null) => attrs.find(a => a.id === id)?.name ?? '';
  const add = (s: PbSuggestion, force = false) => {
    const close = s.matches.filter(m => m.reason !== 'same' || m.other_attribute);
    if (!force && close.length) { setGuard({ s, matches: close }); return; }
    void act({ ids: [s.id], act: 'add', force }, `add:${s.id}`, () => `Added “${s.phrase}” to ${nameOf(s.attribute_id)}`).then(r => { if (r === true) setGuard(null); });
  };
  const aliasTo = (s: PbSuggestion, t: AliasTarget) => void act({ ids: [s.id], act: 'alias', value_id: t.value_id }, `alias:${s.id}`, () => `“${s.phrase}” now means ${t.value} (${t.attribute})`)
    .then(ok => { if (ok === true) { setAlias(null); setGuard(null); } });

  const ids = [...sel];
  const chosen = (rows ?? []).filter(r => sel.has(r.id));
  const oneAttr = chosen.length && chosen.every(r => r.attribute_id && r.attribute_id === chosen[0].attribute_id) ? chosen[0].attribute_id : null;
  const near = chosen.filter(r => r.nearest?.value_id).map(r => r.id);
  const pages = Math.max(1, Math.ceil(count / 20));
  return (
    <PbTile as="section" variant={err && !rows ? 'failed' : 'default'} aria-labelledby="pbt-sug">
      <PbSection id="pbt-sug" title={rows === null ? 'Suggestions' : count ? `${plural(count, 'suggestion')} to look at` : 'No suggestions'}
        hint="Words Playbook saw on products that are not in your lists yet. Add the real ones in one tap, file spellings and Hindi words as “also known as”, ignore the rest.">
        {attrs.length > 0 && (
          <PbChipRow label="Filter suggestions by attribute">
            <PbChip pressed={!attr} onClick={() => { setAttr(''); setPage(0); }}>All</PbChip>
            {attrs.map(a => <PbChip key={a.id} pressed={attr === a.id} onClick={() => { setAttr(a.id); setPage(0); }}>{a.name}</PbChip>)}
            <PbChip pressed={attr === 'none'} onClick={() => { setAttr('none'); setPage(0); }}>No attribute</PbChip>
          </PbChipRow>
        )}
        {rows === null && !err && <TagRowsSkeleton label="Loading suggestions" count={3} />}
        {err && !rows && <TagsError title="Could not load the suggestions" message={err} onRetry={() => void load()} busy={false} />}
        {rows && !rows.length && (attr
          ? <TagsEmpty icon="search" title="Nothing for this attribute" action={<PbButton onClick={() => setAttr('')}>Clear filter</PbButton>}>Try All, or another attribute.</TagsEmpty>
          : <TagsEmpty icon="check" title="All caught up">New words show up here as products come in from stores and Telegram.</TagsEmpty>)}
        {rows && rows.length > 0 && (
          <>
            {canEdit && (
              <div style={{ position: 'sticky', top: 0, zIndex: 1, background: PB.tileSolid, margin: '0 -4px', padding: '8px 4px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: -8, ...pbMeta, color: PB.tx }}>
                  <TagCheck checked={rows.every(r => sel.has(r.id))} onChange={on => setSel(on ? new Set(rows.map(r => r.id)) : new Set())} label="Select every suggestion on this page"
                    text={ids.length ? <><span style={pbNum}>{ids.length}</span> selected</> : 'Select all'} />
                </span>
                {near.length > 0 && <PbButton icon="merge" onClick={() => void act({ ids: near, act: 'nearest' }, 'bulk:nearest', n => `Filed ${plural(n, 'suggestion')} under ${n === 1 ? 'its nearest value' : 'their nearest values'}`, near.length > 1 ? UNDO_HINT : '')}
                  busy={busy === 'bulk:nearest'} busyLabel="Filing…" dim={!!busy && busy !== 'bulk:nearest'}>Same as nearest for {near.length}</PbButton>}
                {ids.length > 0 && oneAttr && <PbButton icon="plus" onClick={() => void act({ ids, act: 'add' }, 'bulk:add', n => `Added ${plural(n, 'value')} to ${nameOf(oneAttr)}`)} busy={busy === 'bulk:add'} busyLabel="Adding…" dim={!!busy && busy !== 'bulk:add'}>Add {ids.length} to {nameOf(oneAttr)}</PbButton>}
                {ids.length > 0 && <PbButton icon="eyeOff" onClick={() => void act({ ids, act: 'ignore' }, 'bulk:ignore', n => `Ignored ${plural(n, 'suggestion')}`)} busy={busy === 'bulk:ignore'} busyLabel="Ignoring…" dim={!!busy && busy !== 'bulk:ignore'}>Ignore {ids.length}</PbButton>}
              </div>
            )}
            {nearErr && (
              <div role="alert" style={{ ...pbErrorBox, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 220px', minWidth: 0 }}>The AI could not look for the nearest values. {nearErr} Try again in a minute.</span>
                <PbButton icon="refresh" onClick={() => rows && void askNearest(rows, true)} busy={asking} busyLabel="Asking…">Ask again</PbButton>
              </div>
            )}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
              {rows.map(s => (
                <SuggestionCard key={s.id} s={s} attrs={attrs} selected={sel.has(s.id)} busy={busy} canEdit={canEdit} asking={asking}
                  onSelect={on => setSel(x => { const n = new Set(x); if (on) n.add(s.id); else n.delete(s.id); return n; })}
                  onAdd={() => add(s)} onAlias={() => setAlias(s)} onUse={t => aliasTo(s, t)}
                  onIgnore={() => void act({ ids: [s.id], act: 'ignore' }, `ignore:${s.id}`, () => `Ignored “${s.phrase}” — it will not be suggested again`)}
                  onMove={to => void act({ ids: [s.id], act: 'move', attribute_id: to }, `move:${s.id}`, () => `Moved “${s.phrase}”${to ? ` to ${nameOf(to)}` : ''}`)} />
              ))}
            </ul>
            {pages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <PbButton icon="chevronLeft" onClick={() => setPage(p => p - 1)} disabled={page === 0}>Previous</PbButton>
                <span style={{ ...pbMeta, ...pbNum }}>{page + 1} / {pages}</span>
                <PbButton onClick={() => setPage(p => p + 1)} disabled={page >= pages - 1}>Next</PbButton>
              </div>
            )}
          </>
        )}
      </PbSection>
      <LookAlikeModal open={!!guard} phrase={guard?.s.phrase ?? ''} target={nameOf(guard?.s.attribute_id ?? null) || 'this attribute'} matches={guard?.matches ?? []}
        busy={busy.startsWith('alias:') ? 'same' : busy.startsWith('add:') ? 'new' : ''}
        onSame={m => guard && aliasTo(guard.s, m)} onNew={() => guard && add(guard.s, true)} onClose={() => setGuard(null)} />
      <AliasPicker phrase={alias?.phrase ?? null} attrs={attrs} matches={alias?.matches ?? []} busy={busy.startsWith('alias:')} onPick={t => alias && aliasTo(alias, t)} onClose={() => setAlias(null)} />
    </PbTile>
  );
}

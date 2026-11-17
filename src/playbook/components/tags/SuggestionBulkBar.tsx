// The suggestions' bulk bar (split out of SuggestionsTile), sticking to the top while the list scrolls. Tick cards, or
// "Select all" for the page, then: Same as nearest (each into its own nearest value, owner 13 Nov) / Add (when all
// share one attribute) / Ignore. With the whole page ticked and more under the chip, "Select all 998" takes every one
// of them (owner, 2026-11-17: "select all should work for all tags"): the same three answers then run over all of them
// in batches (useSelectAll.ts), Add only under one attribute's chip.
import type { SuggestionAct } from '../../data/tags';
import { UNDO_HINT } from '../../data/websites';
import type { PbSuggestion } from '../../tagTypes';
import { PB, pbMeta, pbNum } from '../../pbTheme';
import { PbButton } from '../ui';
import TagCheck from './TagCheck';
import { plural } from './tagText';
import type { SelectAll } from './useSelectAll';

type Act = (a: SuggestionAct, key: string, ok: (n: number) => string, hint?: string) => unknown;
const n = (x: number) => <span style={pbNum}>{x.toLocaleString('en-IN')}</span>;

export default function SuggestionBulkBar({ rows, sel, onSel, count, chip, nameOf, busy, act, all }: {
  rows: PbSuggestion[]; sel: Set<string>; onSel: (s: Set<string>) => void;
  /** How many suggestions the chip holds (all pages). */
  count: number;
  /** The chip: '' = All, 'none' = No attribute, else an attribute id. */
  chip: string;
  nameOf: (id: string | null) => string;
  busy: string; act: Act; all: SelectAll;
}) {
  const everyOne = all.ids, run = all.progress;
  const pageAll = rows.length > 0 && rows.every(r => sel.has(r.id));
  const chosen = rows.filter(r => sel.has(r.id));
  const ids = chosen.map(r => r.id);
  const oneAttr = chosen.length && chosen.every(r => r.attribute_id && r.attribute_id === chosen[0].attribute_id) ? chosen[0].attribute_id : null;
  const near = chosen.filter(r => r.nearest?.value_id).map(r => r.id);
  const chipName = chip && chip !== 'none' ? nameOf(chip) : '';
  const off = (k: string) => !!busy || (!!run && run.act !== k);
  const going = (verb: string) => (run ? <>{verb}… {n(run.sent)} / {n(run.total)}</> : `${verb}…`);
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 1, background: PB.tileSolid, margin: '0 -4px', padding: '8px 4px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: -8, ...pbMeta, color: PB.tx }}>
        <TagCheck checked={!!everyOne || pageAll} label={everyOne ? 'Clear the selection' : 'Select every suggestion on this page'}
          onChange={on => { if (run) return; all.setIds(null); onSel(on && !everyOne ? new Set(rows.map(r => r.id)) : new Set()); }}
          text={everyOne ? <>All {n(everyOne.length)} selected</> : ids.length ? <>{n(ids.length)} selected</> : 'Select all'} />
      </span>
      {everyOne ? (<>
        <PbButton icon="merge" onClick={() => void all.run('nearest')} busy={run?.act === 'nearest'} busyLabel={going('Filing')} dim={off('nearest')}
          aria-label="Same as nearest: each selected suggestion that has a nearest value is filed under it">Same as nearest</PbButton>
        {chipName && <PbButton icon="plus" onClick={() => void all.run('add', chipName)} busy={run?.act === 'add'} busyLabel={going('Adding')} dim={off('add')}>Add {n(everyOne.length)} to {chipName}</PbButton>}
        <PbButton icon="eyeOff" onClick={() => void all.run('ignore')} busy={run?.act === 'ignore'} busyLabel={going('Ignoring')} dim={off('ignore')}>Ignore {n(everyOne.length)}</PbButton>
      </>) : (<>
        {pageAll && count > rows.length && (
          <PbButton icon="check" onClick={() => void all.pick(chip)} busy={all.picking} busyLabel="Selecting…" dim={!!busy}>Select all {n(count)}</PbButton>
        )}
        {near.length > 0 && <PbButton icon="merge" onClick={() => void act({ ids: near, act: 'nearest' }, 'bulk:nearest', k => `Filed ${plural(k, 'suggestion')} under ${k === 1 ? 'its nearest value' : 'their nearest values'}`, near.length > 1 ? UNDO_HINT : '')}
          busy={busy === 'bulk:nearest'} busyLabel="Filing…" dim={!!busy && busy !== 'bulk:nearest'}>Same as nearest for {near.length}</PbButton>}
        {ids.length > 0 && oneAttr && <PbButton icon="plus" onClick={() => void act({ ids, act: 'add' }, 'bulk:add', k => `Added ${plural(k, 'value')} to ${nameOf(oneAttr)}`)} busy={busy === 'bulk:add'} busyLabel="Adding…" dim={!!busy && busy !== 'bulk:add'}>Add {ids.length} to {nameOf(oneAttr)}</PbButton>}
        {ids.length > 0 && <PbButton icon="eyeOff" onClick={() => void act({ ids, act: 'ignore' }, 'bulk:ignore', k => `Ignored ${plural(k, 'suggestion')}`)} busy={busy === 'bulk:ignore'} busyLabel="Ignoring…" dim={!!busy && busy !== 'bulk:ignore'}>Ignore {ids.length}</PbButton>}
      </>)}
    </div>
  );
}

// node --test --experimental-strip-types supabase/functions/pb-products/test/
// The ready gate with required attributes (tagGate.ts; SQL twin pb_products_refresh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateMoves, gateStatus, missingAttrs, missingNote } from '../tagGate.ts';

const LINKED = [{ id: 'col', name: 'Colour' }, { id: 'work', name: 'Work' }];
const P = (o = {}) => ({ status: 'ready', cost_price: 900, sell_price: null, category: 'Lehenga', ai_read_at: '2026-11-10T00:00:00Z', ai_error: null, ...o });

test('all filled → ready', () => {
  assert.deepEqual(missingAttrs(LINKED, ['col', 'work']), []);
  assert.equal(gateStatus(P({ status: 'needs_info' }), []), 'ready');
});

test('one missing → needs_info with the reason', () => {
  const m = missingAttrs(LINKED, ['col']);
  assert.deepEqual(m, ['Work']);
  assert.equal(gateStatus(P(), m), 'needs_info');
  assert.equal(missingNote(missingAttrs(LINKED, [])), 'Missing: Colour, Work');
});

test('manual fill of the last one → ready again', () => {
  const before = gateStatus(P(), missingAttrs(LINKED, ['col']));
  const after = gateStatus(P({ status: before }), missingAttrs(LINKED, ['col', 'work']));
  assert.deepEqual([before, after], ['needs_info', 'ready']);
});

test('unlinking an attribute frees products', () => {
  assert.equal(gateStatus(P({ status: 'needs_info' }), missingAttrs([{ id: 'col', name: 'Colour' }], ['col'])), 'ready');
});

test('price and category still count; new / reading / archived never move; an unread hold stays', () => {
  assert.equal(gateStatus(P({ cost_price: null }), []), 'needs_info');
  assert.equal(gateStatus(P({ cost_price: null, sell_price: 2499 }), []), 'ready');
  assert.equal(gateStatus(P({ category: '' }), []), 'needs_info');
  for (const s of ['new', 'reading', 'archived']) assert.equal(gateStatus(P({ status: s }), ['Work']), s);
  assert.equal(gateStatus(P({ status: 'needs_info', ai_read_at: null }), []), 'needs_info');
});

test('gateMoves counts the dry-run projection', () => {
  assert.deepEqual(gateMoves([{ before: 'ready', after: 'needs_info' }, { before: 'needs_info', after: 'ready' }, { before: 'ready', after: 'ready' }]), { to_needs_info: 1, to_ready: 1 });
});

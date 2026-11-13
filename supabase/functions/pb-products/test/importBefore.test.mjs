// node --test --experimental-strip-types supabase/functions/pb-products/test/
// A repeat import: what Playbook already holds from a website (www. or not), and the vendor it was filed under.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { importedBefore } = await import('../import/actions.ts');

function world({ count = 0, runs = [], countFails = false }) {
  const asked = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url));
    asked.push(`${init.method || 'GET'} ${u.replace('https://sb.example/rest/v1/', '')}`);
    if (init.method === 'HEAD') return new Response(null, { status: countFails ? 500 : 200, headers: { 'content-range': `0-0/${count}` } });
    if (u.includes('pb_import_runs?')) return new Response(JSON.stringify(runs), { status: 200 });
    return new Response('[]', { status: 200 });
  };
  return asked;
}

test('a website imported before: its product count, the vendor of its last import and the manufacturers it left out, under either address', async () => {
  const asked = world({ count: 136, runs: [{ pb_vendors: { name: 'Kashtbhanjan' }, skip_makers: ['Shayam Creation'] }] });
  assert.deepEqual(await importedBefore('www.bahu.example'), { count: 136, vendor: 'Kashtbhanjan', skip: ['Shayam Creation'] });
  const head = asked.find(a => a.startsWith('HEAD'));
  assert.ok(head.includes('source=eq.import') && head.includes('source_ref.like."www.bahu.example:*"') && head.includes('source_ref.like."bahu.example:*"'), head);
  const runs = asked.find(a => a.includes('pb_import_runs'));
  assert.ok(runs.includes('host=in.(www.bahu.example,bahu.example)') && runs.includes('vendor_id=not.is.null') && runs.includes('order=created_at.desc') && runs.includes('limit=1'), runs);
  // the manufacturers left out come from the website's latest import, with or without a vendor
  const skip = asked.find(a => a.includes('select=skip_makers'));
  assert.ok(skip.includes('host=in.(www.bahu.example,bahu.example)') && !skip.includes('vendor_id') && skip.includes('order=created_at.desc') && skip.includes('limit=1'), skip);
});

test('a first import: nothing here and no vendor; a count that fails reads as none', async () => {
  world({});
  assert.deepEqual(await importedBefore('new.example'), { count: 0, vendor: null, skip: [] });
  world({ count: 50, countFails: true, runs: [{ pb_vendors: null }] });
  assert.deepEqual(await importedBefore('new.example'), { count: 0, vendor: null, skip: [] });
});

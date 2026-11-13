// node --test --experimental-strip-types supabase/functions/pb-products/test/
// Which sales channel is the Online Store (shopify.ts isOnlineStore). Shopify used to title its catalog "Online Store";
// a live store showed "Channel Catalog 371789562016 for Online Store" on 13 Nov 2026, and the old exact match then said
// "this store has no Online Store sales channel" for a store that has one.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { isOnlineStore } = await import('../shopify.ts');

test('the Online Store channel, under its old and its new catalog title', () => {
  for (const t of ['Online Store', 'Channel Catalog 371789562016 for Online Store', ' channel catalog 1  FOR online store ']) assert.equal(isOnlineStore(t), true, t);
});

test('never another channel, or a title that only mentions the Online Store', () => {
  for (const t of ['Channel Catalog 371789594784 for Point of Sale', 'Online Store Extra', 'Not Online Store', 'Online Stores', '', null, undefined]) assert.equal(isOnlineStore(t), false, String(t));
});

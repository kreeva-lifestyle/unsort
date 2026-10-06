// SKU product thumbnails from Dropbox, without lag or load.
//
// The sku-thumbs edge function makes ONE 256px JPEG per SKU from its Dropbox
// folder and stores it in the public sku-thumbs bucket; public.sku_thumbs
// records the outcome. Here every SKU a screen asks for is batched (40 ms),
// looked up in that table in ONE query, and served as a plain CDN image from
// then on. Only SKUs never seen before go to the edge function — 12 per call,
// one call at a time — so a page of 25 jobs costs one table read and, the
// first time only, a couple of edge calls. Results are cached for the
// session; a failure just means "no photo" for this session (logged).
// Photos are per design, so a sized variant (DRS171-L) shows its design's
// photo (DRS171) — Dropbox has no per-size folders.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { logSwallowed } from './errorLogger';
import { normSize } from './sizeAlteration';
import type { SkuThumbRow } from '../types/database';

const RECHECK_MISSING_MS = 3 * 24 * 3600_000;   // same as the edge function
const SKU_KEY = /^[A-Z0-9][A-Z0-9 _.-]{0,47}$/;
const EDGE_BATCH = 12;

/** url = has a thumbnail, null = no photo (or lookup failed this session). */
const cache = new Map<string, string | null>();
const queued = new Set<string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let edgeChain: Promise<void> = Promise.resolve();

export const normSku = (s: string) => {
  const sku = s.trim().toUpperCase();
  const m = /^(.+)-([0-9A-Z]{1,5})$/.exec(sku);
  return m && normSize(m[2]) ? m[1] : sku;
};
const urlFor = (sku: string, version: number) =>
  `${supabase.storage.from('sku-thumbs').getPublicUrl(`${sku}.jpg`).data.publicUrl}?v=${version}`;
const notify = () => listeners.forEach(fn => fn());

/** Ask for thumbnails; already known or in-flight SKUs cost nothing. */
export function requestSkuThumbs(skus: string[]) {
  for (const raw of skus) {
    const sku = normSku(raw);
    if (!sku || cache.has(sku) || pending.has(sku)) continue;
    if (!SKU_KEY.test(sku)) { cache.set(sku, null); continue; }
    queued.add(sku);
  }
  if (queued.size && !timer) timer = setTimeout(flush, 40);
}

async function flush() {
  timer = null;
  const batch = [...queued];
  queued.clear();
  batch.forEach(s => pending.add(s));
  const todo: string[] = [];
  for (let i = 0; i < batch.length; i += 200) {
    const chunk = batch.slice(i, i + 200);
    const { data, error } = await supabase.from('sku_thumbs').select('sku, status, version, checked_at').in('sku', chunk);
    if (error) { logSwallowed('sku thumbs read', error); chunk.forEach(s => { cache.set(s, null); pending.delete(s); }); continue; }
    const rows = new Map(((data ?? []) as Pick<SkuThumbRow, 'sku' | 'status' | 'version' | 'checked_at'>[]).map(r => [r.sku, r]));
    for (const s of chunk) {
      const r = rows.get(s);
      if (r?.status === 'ok') { cache.set(s, urlFor(s, Number(r.version) || 0)); pending.delete(s); }
      else if (r?.status === 'missing' && Date.now() - Date.parse(r.checked_at) < RECHECK_MISSING_MS) { cache.set(s, null); pending.delete(s); }
      else todo.push(s);
    }
  }
  notify();
  if (todo.length) edgeChain = edgeChain.then(() => fill(todo));
}

/** Never-seen SKUs: the edge function finds and stores their thumbnails. */
async function fill(skus: string[]) {
  for (let i = 0; i < skus.length; i += EDGE_BATCH) {
    const chunk = skus.slice(i, i + EDGE_BATCH);
    try {
      const { data, error } = await supabase.functions.invoke('sku-thumbs', { body: { skus: chunk } });
      if (error) throw error;
      const results = ((data as { results?: { sku: string; status: string; version: number }[] })?.results ?? []);
      const got = new Map(results.map(r => [r.sku, r]));
      chunk.forEach(s => { const r = got.get(s); cache.set(s, r?.status === 'ok' ? urlFor(s, r.version) : null); });
      if ((data as { error?: string })?.error) logSwallowed('sku thumbs fill', (data as { error: string }).error);
    } catch (e) {
      logSwallowed('sku thumbs fill', e);
      chunk.forEach(s => cache.set(s, null));
    } finally {
      chunk.forEach(s => pending.delete(s));
      notify();
    }
  }
}

/** The thumbnail URL: undefined while loading, null when there is no photo. */
export function useSkuThumb(sku: string | null | undefined): string | null | undefined {
  const key = sku ? normSku(sku) : '';
  const [, bump] = useState(0);
  useEffect(() => {
    if (!key) return;
    const fn = () => bump(n => n + 1);
    listeners.add(fn);
    requestSkuThumbs([key]);
    return () => { listeners.delete(fn); };
  }, [key]);
  if (!key) return null;
  return cache.has(key) ? cache.get(key)! : undefined;
}

/** For one-off use (share images): resolves once the SKU is known. */
export function skuThumbUrl(sku: string): Promise<string | null> {
  const key = normSku(sku);
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  return new Promise(res => {
    const fn = () => { if (cache.has(key)) { listeners.delete(fn); res(cache.get(key)!); } };
    listeners.add(fn);
    requestSkuThumbs([key]);
    setTimeout(() => { listeners.delete(fn); res(cache.get(key) ?? null); }, 20_000);
  });
}

/** The SKU's photo at 2048px for the zoom view, fetched only when someone
 *  taps a thumbnail; an object URL kept for the session. null = none. */
const big = new Map<string, Promise<string | null>>();
export function skuBigPhoto(sku: string): Promise<string | null> {
  const key = normSku(sku);
  let p = big.get(key);
  if (!p) {
    p = supabase.functions.invoke('sku-thumbs', { body: { big: key } }).then(({ data, error }) => {
      if (error || !(data instanceof Blob)) {
        if (error) logSwallowed('sku big photo', error);
        big.delete(key);   // a later tap may try again
        return null;
      }
      return URL.createObjectURL(new Blob([data], { type: 'image/jpeg' }));
    });
    big.set(key, p);
  }
  return p;
}

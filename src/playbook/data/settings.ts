// Division-wide Product Directory settings (pb_settings: reader, categories,
// automation) and the "Run now" call to the worker.
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import { pbCall } from './pbFunctions';
import type { PbSettings } from '../types';

export const DEFAULT_SETTINGS: PbSettings = {
  reader: { model: 'claude-haiku-5-5', effort: '' },
  categories: [],
  automation: { paused: false },
};

export async function getSettings(): Promise<PbSettings> {
  const { data, error } = await supabase.from('pb_settings').select('key,value').in('key', ['reader', 'categories', 'automation']);
  if (error) throw error;
  const v = (k: string) => data?.find(r => r.key === k)?.value;
  const reader = v('reader'), cats = v('categories'), auto = v('automation');
  return {
    reader: { ...DEFAULT_SETTINGS.reader, ...(reader && typeof reader === 'object' ? reader : {}) },
    categories: Array.isArray(cats) ? cats.map(String) : [],
    automation: { paused: !!auto?.paused },
  };
}

/** Upsert one key (the rows are seeded by the migration; upsert also heals a missing one). */
export async function saveSetting<K extends keyof PbSettings>(key: K, value: PbSettings[K]) {
  const { error } = await supabase.from('pb_settings').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
  supabase.from('pb_activity').insert({ action: 'settings_edited', details: { key } })
    .then(({ error: e }) => { if (e) logSwallowed('pb_activity insert', e); });
}

export type WorkResult = { ok: boolean; read: number; routed: number; generated: number; published: number; failed: number };
export const runWorker = () => pbCall<WorkResult>('work');

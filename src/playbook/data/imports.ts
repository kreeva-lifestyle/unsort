// Import from website (Products → "Import from website"): the staff actions
// of the pb-products edge function (check a store, start, cancel) and the
// run rows the app reads for the progress tile and the history. The app
// never writes pb_import_runs — the function validates the URL and respects
// robots.txt. Contract: supabase/migrations/20261108090000_pb_website_import.sql,
// docs/playbook/product-directory-spec.md ("Import from website").
// Errors are thrown as-is — callers show them with friendlyError().
import { supabase } from '../../lib/supabase';
import { pbCall } from './pbFunctions';
import type { PbImportPlatform, PbImportRun, PbImportSample } from '../types';

/** What import_check found out about the store before anything is copied. */
export type ImportCheck = {
  ok: boolean; platform: PbImportPlatform; host: string;
  /** Products on the site: a count, "5000+" when counting stopped at the cap, or null when unknown. */
  estimate: number | string | null;
  /** In-stock products, when the store can say; otherwise missing / null. */
  estimate_in_stock?: number | string | null;
  /** The first 3 products, for the preview. */
  sample: PbImportSample[];
  /** Plain sentences, e.g. "This site blocks automated access". */
  warnings: string[];
  /** Brand name from the site title / og:site_name, else the host. */
  vendor_suggestion: string | null;
};

export const checkWebsite = (url: string) => pbCall<ImportCheck>('import_check', { url });

/** `estimate` is display only: the run tile shows "480 of ~980" from it. */
export type ImportStart = { url: string; in_stock_only: boolean; use_their_price: boolean; vendor_name: string; estimate: number | string | null };
export const startImport = (o: ImportStart) => pbCall<{ ok: boolean; run_id: string }>('import_start', { ...o });
/** Status → cancelled unless the run is already done. */
export const cancelImport = (run_id: string) => pbCall<{ ok: boolean }>('import_cancel', { run_id });

/** A run as the app shows it (no claimed_at / created_by). */
export type ImportRunRow = Omit<PbImportRun, 'claimed_at' | 'created_by'> & { pb_vendors: { name: string } | null };
const RUN_COLS = 'id,url,host,platform,status,in_stock_only,use_their_price,vendor_id,cursor,found,added,skipped,out_of_stock,failed,sample,error,'
  + 'created_at,started_at,finished_at,updated_at,pb_vendors(name)';
export const HISTORY_SIZE = 20;

/** The newest run, for the progress tile: queued / running, or the last one that finished. */
export async function latestImportRun(): Promise<ImportRunRow | null> {
  const { data, error } = await supabase.from('pb_import_runs').select(RUN_COLS).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as unknown as ImportRunRow | null) ?? null;
}

/** Import history (Settings): the last 20 runs, newest first. */
export async function listImportRuns(): Promise<ImportRunRow[]> {
  const { data, error } = await supabase.from('pb_import_runs').select(RUN_COLS).order('created_at', { ascending: false }).limit(HISTORY_SIZE);
  if (error) throw error;
  return (data ?? []) as unknown as ImportRunRow[];
}

export const isActiveRun = (r: Pick<PbImportRun, 'status'> | null | undefined) => r?.status === 'queued' || r?.status === 'running';

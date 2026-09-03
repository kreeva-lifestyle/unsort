// AI-powered suggestions for the Price Projector — client side.
// The batch is generated and SAVED by the pricing-ai edge function (which
// deletes the product's previous batch first). The input fingerprint is a
// SHA-256 of the exact numbers the batch was built from; when the live sheet
// no longer matches, the card offers Regenerate.
import { supabase, SUPABASE_ANON_KEY } from '../../../lib/supabase';

export const AI_FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/pricing-ai';

export interface AiSuggestion { title: string; detail: string; area: string; impact: 'high' | 'medium' | 'low'; savingPerPc: number | null }
export interface AiBatch { id: string; costing_product_id: string; input_hash: string; model: string; suggestions: AiSuggestion[]; created_at: string }

const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v as object).sort().map(k => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(v);
};

export async function inputHash(facts: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(facts));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function loadAiBatch(productId: string): Promise<{ batch: AiBatch | null; error: unknown }> {
  const { data, error } = await supabase.from('pricing_ai_suggestions')
    .select('id, costing_product_id, input_hash, model, suggestions, created_at')
    .eq('costing_product_id', productId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return { batch: (data as AiBatch | null) ?? null, error };
}

export async function generateAiBatch(productId: string, hash: string, facts: unknown, deterministic: { title: string; detail: string }[]): Promise<{ batch?: AiBatch; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token || SUPABASE_ANON_KEY;
  const r = await fetch(AI_FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ action: 'suggest', productId, inputHash: hash, facts, deterministic }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok) return { error: String(data?.error || `AI request failed (${r.status})`) };
  return { batch: data.row as AiBatch };
}

// Claude calls — the same model block and request shape as listing-ai,
// pricing-ai, product-detail and buyer-spider: price table, legacy-name map,
// effort in output_config, the server-side refusal fallback for non-Haiku
// models, structured output through output_config.format json_schema, and
// the anthropic_api_key from app_secrets (never in the browser).
import { HttpError, fetchT } from './http.ts';
import { getSecret } from './db.ts';

// USD per million tokens: input / output / cache read (cache write = 1.25 × input).
// Haiku 5.5 costs 5× (input and output) once a prompt passes 100K tokens.
const MODELS: Record<string, { in: number; out: number; read: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5, read: 0.01 },
  'claude-sonnet-5-5': { in: 2, out: 10, read: 0.2 },
  'claude-opus-5-5': { in: 4, out: 20, read: 0.2 },
};
const LEGACY_MODELS: Record<string, string> = { 'claude-haiku-4-5': 'claude-haiku-5-5', 'claude-sonnet-5': 'claude-sonnet-5-5', 'claude-opus-4-8': 'claude-opus-5-5' };
const DEFAULT_MODEL = 'claude-haiku-5-5';
// '' = the model's own default effort.
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** A saved model name → a model we can call (older names move to the same tier; unknown → Haiku). */
export function pickModel(m: string | null | undefined): string {
  const id = LEGACY_MODELS[String(m || '')] || String(m || '');
  return MODELS[id] ? id : DEFAULT_MODEL;
}
export const pickEffort = (e: string | null | undefined) => (EFFORTS.includes(String(e || '')) ? String(e) : '');

interface Usage { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
function estUsd(model: string, u: Usage): number {
  const p = MODELS[model] || MODELS[DEFAULT_MODEL];
  const i = u.input_tokens || 0, o = u.output_tokens || 0, cr = u.cache_read_input_tokens || 0, cw = u.cache_creation_input_tokens || 0;
  const k = model === 'claude-haiku-5-5' && i + cr + cw > 100_000 ? 5 : 1;
  return Math.round(k * (i * p.in + cw * p.in * 1.25 + cr * p.read + o * p.out) / 1e6 * 10000) / 10000;
}

/** One Messages API request. Thinking is adaptive (effort is the control); Opus and Sonnet
 *  get the server-side refusal fallback. Thinking also uses max_tokens — leave room. */
function claudeRequest(apiKey: string, model: string, effort: string, body: Record<string, unknown>): RequestInit {
  const fallback = model !== 'claude-haiku-5-5';
  const beta = fallback ? ['server-side-fallback-2026-07-01'] : [];
  const outputConfig = { ...((body.output_config as Record<string, unknown>) || {}), ...(effort ? { effort } : {}) };
  return {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(beta.length ? { 'anthropic-beta': beta.join(',') } : {}) },
    body: JSON.stringify({ model, ...body, ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}), ...(fallback ? { fallbacks: 'default' } : {}) }),
  };
}

export type Block = { type: 'text'; text: string } | { type: 'image'; source: { type: 'url'; url: string } };
export const imageBlock = (url: string): Block => ({ type: 'image', source: { type: 'url', url } });

export interface AiResult<T> { data: T; usd: number; model: string; effort: string }

let keyCache: { key: string; at: number } | null = null;
async function apiKey(): Promise<string> {
  if (keyCache && Date.now() - keyCache.at < 60_000) return keyCache.key;
  const key = await getSecret('anthropic_api_key');
  if (!key) throw new HttpError(409, 'No Anthropic API key is saved yet (Playbook uses the same key as Listing AI) — ask an admin to add it.');
  keyCache = { key, at: Date.now() };
  return key;
}

interface ClaudeReply {
  content?: { type: string; text?: string }[]; stop_reason?: string; usage?: Usage; model?: string;
  error?: { message?: string };
}

/** Ask Claude for JSON matching `schema`. Throws HttpError with a plain sentence on any failure. */
export async function askClaude<T>(o: { model: string; effort: string; system: string; content: Block[]; schema: Record<string, unknown>; maxTokens: number; timeoutMs: number }): Promise<AiResult<T>> {
  const model = pickModel(o.model), effort = pickEffort(o.effort);
  const r = await fetchT('https://api.anthropic.com/v1/messages', claudeRequest(await apiKey(), model, effort, {
    max_tokens: o.maxTokens,
    system: o.system,
    messages: [{ role: 'user', content: o.content }],
    output_config: { format: { type: 'json_schema', schema: o.schema } },
  }), o.timeoutMs).catch((e) => {
    throw new HttpError(504, e instanceof DOMException ? 'The AI took too long to answer — it will be tried again.' : 'Could not reach the AI service — it will be tried again.');
  });
  const data = await r.json().catch(() => ({})) as ClaudeReply;
  if (r.status === 401) throw new HttpError(502, 'The Anthropic API key was rejected — ask an admin to update it.');
  if (r.status === 429) throw new HttpError(503, 'The AI is busy right now (rate limit) — it will be tried again shortly.');
  if (r.status === 529 || r.status >= 500) throw new HttpError(503, 'The AI service is overloaded — it will be tried again shortly.');
  if (r.status >= 400) {
    const msg = String(data?.error?.message || '');
    if (/image|url|fetch/i.test(msg)) throw new HttpError(502, 'The AI could not open one of the product photos.');
    throw new HttpError(502, `The AI request was refused (${r.status})${msg ? `: ${msg.slice(0, 160)}` : ''}.`);
  }
  // The model answered and was paid for: a failure from here on carries its cost (http.ts usdOf), so it is logged and counted.
  const paid = (status: number, msg: string) => Object.assign(new HttpError(status, msg), { usd: estUsd(model, data.usage || {}) });
  if (data.stop_reason === 'refusal') throw paid(422, 'The AI declined to handle this product — fill it in by hand.');
  if (data.stop_reason === 'max_tokens') throw paid(502, 'The AI answer was cut off — try a lower effort setting.');
  const text = (data.content || []).find(b => b.type === 'text')?.text || '';
  let parsed: T;
  try {
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    parsed = JSON.parse(s >= 0 && e > s ? text.slice(s, e + 1) : text) as T;
  } catch {
    throw paid(502, 'Could not read the AI answer — it will be tried again.');
  }
  return { data: parsed, usd: estUsd(model, data.usage || {}), model, effort };
}

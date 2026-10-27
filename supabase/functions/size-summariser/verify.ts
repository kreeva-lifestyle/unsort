// Size Summariser — what makes a picture-only form checkable, and the
// pictures land on the right card.
//
// transcribe(): a PDF made by "Microsoft Print to PDF" or a phone scan has
// no text layer, so "every number really is on its page" has nothing to
// compare against. A second, independent read by a cheaper model (setting
// verify_model, prompt verify_prompt) writes down each question and the
// answer shown, and that transcript stands in for the missing text. Two
// different reads agreeing is the check; a disagreement marks the value
// doubtful on the sheet.
//
// numbersIn(): every number a page shows, with 35½, 35 1/2, 35.5 alike.
//
// assignDiagrams(): the device sends every picture on every page with its
// position; one measurement on a page gets that page's largest picture,
// several get the pictures top to bottom in the order of their questions.

// deno-lint-ignore-file no-explicit-any
import type { Page } from './validate.ts';

export interface DiagramRef { page: number; k: number; top: number; area: number; hash: string }

const TRANSCRIPT = {
  type: 'object',
  required: ['pages'],
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'object', required: ['page', 'items'],
        properties: {
          page: { type: 'integer' },
          items: { type: 'array', items: { type: 'object', required: ['question', 'answer'], properties: { question: { type: 'string' }, answer: { type: 'string', description: 'exactly as shown; empty when unanswered' } } } },
        },
      },
    },
  },
};

/** page number → "question\nanswer" lines, read from the page images alone. */
export async function transcribe(post: (model: string, body: Record<string, unknown>) => Promise<any>, model: string, prompt: string, pages: Page[]): Promise<{ texts: Map<number, string>; usage: any; model: string }> {
  const content: any[] = [];
  for (const p of pages) {
    if (!p.image) continue;
    content.push({ type: 'text', text: `PAGE ${p.n}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.image } });
  }
  content.push({ type: 'text', text: 'Call the page_answers tool exactly once with every page above.' });
  const body = await post(model, {
    max_tokens: 6000,
    system: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }],
    tools: [{ name: 'page_answers', description: 'Each page: every question and the answer shown on it.', input_schema: TRANSCRIPT }],
    messages: [{ role: 'user', content }],
  });
  const tool = (body?.content || []).find((b: any) => b.type === 'tool_use' && b.name === 'page_answers');
  const texts = new Map<number, string>();
  for (const pg of tool?.input?.pages || []) {
    const lines = (pg.items || []).flatMap((it: any) => [String(it.question || ''), String(it.answer || '')]).filter(Boolean);
    if (Number.isInteger(pg.page)) texts.set(pg.page, lines.join('\n'));
  }
  return { texts, usage: body?.usage || {}, model: body?.model || model };
}

/** Every number shown in a text: 35, 35.5, 35½, 35 1/2, 35-1/2 (all as numbers). */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const t = text.replace(/½/g, ' 1/2').replace(/¼/g, ' 1/4').replace(/¾/g, ' 3/4');
  const re = /(\d+(?:\.\d+)?)(?:[\s-]+(\d)\/(\d))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const whole = Number(m[1]);
    out.push(whole);
    if (m[2] && Number(m[3])) out.push(whole + Number(m[2]) / Number(m[3]));
  }
  return out;
}
export const shows = (text: string, v: number) => numbersIn(text).some(n => Math.abs(n - v) < 0.01);

/** Sets m.diagram on each measurement from the pictures on its page. */
export function assignDiagrams(measurements: any[], refs: DiagramRef[]): void {
  const byPage = new Map<number, DiagramRef[]>();
  for (const r of refs) if (r && Number.isInteger(r.page) && typeof r.hash === 'string' && /^[0-9a-f]{40}$/.test(r.hash)) byPage.set(r.page, [...(byPage.get(r.page) || []), r]);
  const onPage = new Map<number, any[]>();
  for (const m of measurements) onPage.set(Number(m.page), [...(onPage.get(Number(m.page)) || []), m]);
  for (const [page, ms] of onPage) {
    const pics = (byPage.get(page) || []).slice().sort((a, b) => a.top - b.top);
    if (!pics.length) continue;
    if (ms.length === 1) { ms[0].diagram = pics.reduce((a, b) => (b.area > a.area ? b : a)).hash; continue; }
    const ordered = ms.slice().sort((a, b) => (Number(a.y_on_page) || 0) - (Number(b.y_on_page) || 0));
    if (pics.length === ordered.length) ordered.forEach((m, i) => { m.diagram = pics[i].hash; });
    else {   // counts differ: the nearest unused picture below each question, if any
      const used = new Set<DiagramRef>();
      for (const m of ordered) {
        const y = Number(m.y_on_page);
        const below = Number.isFinite(y) ? pics.find(p => !used.has(p) && p.top >= y - 0.02) : undefined;
        if (below) { m.diagram = below.hash; used.add(below); }
      }
    }
  }
}

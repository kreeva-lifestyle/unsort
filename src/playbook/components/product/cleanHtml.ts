// Hand-edited listing descriptions go live on a storefront, so they keep only
// what the spec allows: p, ul, li, h3, strong, em, br — no attributes. b / i become
// strong / em and every heading an h3; script-like elements are dropped with
// their content; any other tag is unwrapped (its text stays).
import { escHtml } from '../../../lib/escape';

const KEEP = new Set(['p', 'ul', 'li', 'h3', 'strong', 'em', 'br']);
const RENAME: Record<string, string> = { b: 'strong', i: 'em', ol: 'ul', h1: 'h3', h2: 'h3', h4: 'h3', h5: 'h3', h6: 'h3' };
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'head', 'title', 'link', 'meta', 'form', 'input', 'button', 'select', 'textarea']);

function walk(n: Node): string {
  if (n.nodeType === Node.TEXT_NODE) return escHtml(n.textContent ?? '');
  if (n.nodeType !== Node.ELEMENT_NODE) return '';
  const raw = (n as Element).tagName.toLowerCase();
  if (DROP.has(raw)) return '';
  const inner = Array.from(n.childNodes).map(walk).join('');
  const tag = RENAME[raw] ?? raw;
  if (!KEEP.has(tag)) return inner;
  return tag === 'br' ? '<br>' : `<${tag}>${inner}</${tag}>`;
}

export function cleanDescriptionHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return Array.from(doc.body.childNodes).map(walk).join('').trim();
}

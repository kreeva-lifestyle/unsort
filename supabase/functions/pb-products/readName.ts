// Pure: the product name leads with the colour the reader returned.
// The reader is told to build the name as colour + fabric + what it is
// (readerPrompt.ts), but on about one product in twelve the name kept another
// word for the colour ("Dark Pink … " beside the colour "Rani Pink"). A
// program settles it: when the name carries the fabric and opens with a short
// run of plain words that is not the colour, that opening is replaced by the
// colour. A name without the fabric, or one that already says the colour, is
// left alone — nothing is guessed. No I/O; tested in test/readerPrompt.test.mjs.
const flat = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function nameWithColour(name: unknown, color: unknown, fabric: unknown): string {
  const n = flat(name), c = flat(color), f = flat(fabric);
  if (!n || !c || !f) return n;
  const low = n.toLowerCase();
  if (low.includes(c.toLowerCase())) return n;
  const at = low.indexOf(f.toLowerCase());
  if (at < 0) return n;
  const lead = n.slice(0, at).trim();
  if (lead && (lead.split(' ').length > 3 || !/^[\p{L} ]+$/u.test(lead))) return n; // not a plain colour phrase
  return `${c} ${n.slice(at)}`;
}

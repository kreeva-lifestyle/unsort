// Product titles and descriptions that read like a person wrote them (owner,
// 2026-11-10: "specifically used to write product descriptions and product
// title. For playbook only").
//
// The patterns come from the Humanizer skill (github.com/blader/humanizer,
// MIT, release 4.0.0; the full text is in .claude/skills/humanizer/), which
// is built on Wikipedia's "Signs of AI writing". That skill edits prose after
// it is written; here the same patterns are given to the listing writer up
// front, in product-listing terms, so there is no second AI call per listing.
// Change the two together.
//
// Three parts:
//   HUMAN_RULES  lines for the writer's instructions (genPrompt.ts)
//   tidyCopy     the fixes a program can make safely (dashes, curly quotes)
//   copyTells    the patterns still present, for the activity log and tests

export const HUMAN_RULES: string[] = [
  'Write the way someone who knows this product would describe it to a shopper: plain, specific, no sales pitch.',
  'Every sentence must state a fact about this product (what it is, colour, fabric, work, what is in the set, sizes, care, the occasion if one is given). When the facts are few, write less: never pad to reach the word count.',
  'Do not write any of these:',
  '- a contrast that only adds weight ("not just a kurta, it is a statement", "more than an outfit"). Say what the product is.',
  '- slogans and one-line closers ("Elegance redefined.", "Make it yours.", "A must-have for your wardrobe."). End on the last fact.',
  '- openers that announce instead of describe ("Introducing", "Meet", "Step into", "Get ready to", "Look no further", "Elevate your").',
  '- praise in threes ("elegant, graceful and timeless") or strings of adjectives. Keep an adjective only when it is a fact: a colour, a fabric, a fit, a kind of work.',
  '- sales words: stunning, exquisite, gorgeous, breathtaking, luxurious, timeless, effortless, must-have, perfect for, statement piece, elevate, epitome, unparalleled, vibrant, intricate, meticulous, crafted to perfection, showcase, testament, enhance, a touch of.',
  '- an "-ing" phrase tacked on to claim a benefit the facts do not give ("ensuring all-day comfort", "making it ideal for every occasion", "adding a touch of elegance").',
  '- claims with no source ("loved by customers", "trending", "best-selling", "premium quality", "designed by experts").',
  '- "features", "boasts", "offers", "comes adorned with" or "serves as" where "is", "has" or "comes with" says the same.',
  '- em dashes or en dashes; use a comma, a full stop or brackets. Straight quotes only.',
  '- bold for emphasis or bold labels. Bullets are short plain facts such as "Fabric: georgette", and do not repeat the paragraph word for word.',
  'Do not begin several sentences in a row with the same words ("This kurta... This kurta...").',
  'title: say what the product is (for example colour, fabric, type, work). No praise words in the title.',
  'Before you answer, read your draft once and rewrite any sentence that breaks these rules.',
  'Where the brand voice or the store owner\'s extra instructions ask for something different, follow the store owner.',
];

/** The fixes that never change meaning: curly quotes → straight, and no em or
 *  en dashes (a range such as 38-44 written with one keeps a hyphen; between clauses a comma).
 *  Works on plain text and on the listing's simple HTML alike. */
export function tidyCopy(text: unknown): string {
  return String(text ?? '')
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2')
    .replace(/([^\s<>])[\u2013\u2014]([^\s<>])/g, '$1-$2')
    .replace(/(^|>)\s*(?:[\u2013\u2014]|--)\s*/g, '$1')
    .replace(/\s*(?:[\u2013\u2014]|\s--\s)\s*(?=<|$)/g, '')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/\s+--\s+/g, ', ')
    .replace(/,(\s*,)+/g, ',')
    .replace(/,\s*([.;:!?])/g, '$1');
}

const TELLS: [string, RegExp][] = [
  ['not-x-but-y', /\b(?:not (?:just|only|merely|simply)\b[^.?!<]{0,80}?\b(?:but|it'?s|it is)\b|more than (?:just )?an? [a-z]+)/i],
  ['announcing opener', /(?:^|[.!?]\s+)\s*(?:introducing|meet (?:the|your|our)|step into|get ready to|look no further|elevate your)\b/i],
  ['slogan closer', /\b(?:redefined|make it yours|a must[- ]have|wardrobe (?:essential|staple)|turn heads|steal the show)\b/i],
  ['sales word', /\b(?:stunning|exquisite|gorgeous|breathtaking|luxurious|timeless|effortless(?:ly)?|must[- ]have|perfect for|statement piece|elevate[sd]?|epitome|unparalleled|vibrant|intricate(?:ly)?|meticulous(?:ly)?|crafted to perfection|showcas(?:e|es|ing)|testament|enhanc(?:e|es|ing)|a touch of)\b/i],
  ['tacked-on -ing', /,\s*(?:ensuring|making it|adding|offering|providing|giving you|creating|lending)\b/i],
  ['unsupported claim', /\b(?:loved by|trending|best[- ]selling|premium quality|designed by experts|customers love)\b/i],
  ['boasts / features', /\b(?:boasts?|comes adorned with|serves as|stands as)\b/i],
  ['dash', /[\u2013\u2014]|\s--\s/],
];

/** Names of the patterns still present in a piece of copy (tags are ignored). */
export function copyTells(text: unknown): string[] {
  const t = String(text ?? '').replace(/<[^>]+>/g, ' ');
  return TELLS.filter(([, re]) => re.test(t)).map(([name]) => name);
}

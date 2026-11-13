// Pure: what kind of text a forwarded message carries. No I/O (unit-tested in
// test/group*.test.mjs and test/text.test.mjs). Used by group.ts.
//   DESCRIPTION  a text / caption of 40+ characters with letters; one that
//                names a rate / code / price (₹, INR, Rs 1600, 1600/-); or a
//                short one with a design number and a price in the ways
//                vendors write them ("D.No 5081 Rama 450", "5081 @ 450",
//                "MRP 999", "450rs", "रेट 450", "ભાવ 450") — pre-launch fix
//                D15: these were thrown away, so the photos became a product
//                with no code and no cost.
//   LESS         a short "200 Less", "200/- less", "Less: Rs 200",
//                "Less - 200.50"; also a short "less 200" line inside a
//                description. A text that names another number ("Rate 1600
//                less 200") is a description whose less is read from that line.
//   CHATTER      not about a product (D16): bank / payment details, a text
//                that opens with a greeting, a short "call us" line. It never
//                becomes a description or a product, and is not added to the
//                product before it. A text that names a price, a design
//                number or a product keyword is never chatter (bank details
//                aside). POSTER = the narrower test for a picture's caption
//                (a greeting, bank details): only then is the picture itself
//                set aside.
//   anything else short (an emoji, a sticker, "👇", a row of 👉) is a SEPARATOR.
const DESC_MIN = 40;
const LESS_MAX = 40;
const KEYWORDS = /\b(rate|code|price|inr)\b|₹|\brs\.?\s*\d|\d\s*\/-/i;
const AMT = String.raw`(\d[\d,]*(?:\.\d{1,2})?)(?![\d.,]*\s*%)`;
// "200 less". Not when "less" is followed by its own number ("Rate 1600 less 5%"): there the number before it is the rate.
const LESS_A = new RegExp(String.raw`${AMT}\s*(?:\/-|rs\.?|₹|inr|rupees?)?\s*(?:\/-)?\s*less\b(?!\s*[:\-–=]?\s*(?:rs\.?|₹|inr)?\s*\d)`, 'i');
const LESS_B = new RegExp(String.raw`\bless\b\s*[:\-–=]?\s*(?:rs\.?|₹|inr)?\s*${AMT}`, 'i');
const amountOf = (s: string) => { const n = Number(s.replace(/,/g, '')); return Number.isFinite(n) && n > 0 && n < 10_000_000 ? n : null; };
/** A less phrase in one short line. */
const lessIn = (line: string) => {
  const l = line.trim();
  if (!l || l.length > LESS_MAX) return null;
  const m = LESS_B.exec(l) ?? LESS_A.exec(l);
  const amount = m ? amountOf(m[1]) : null;
  return m && amount !== null ? { amount, match: m[0], rest: l.replace(m[0], '') } : null;
};

/** The amount of a short "Less" message, else null ("Rate 1600 less 200" is a description). */
export function lessOf(text: string): number | null {
  const x = lessIn(text);
  return x && !/\d/.test(x.rest) ? x.amount : null;
}
/** A less written on a short line inside a description ("RATE 1600 LESS 200"). */
export function inlineLess(text: string): number | null {
  for (const l of text.split('\n')) { const x = lessIn(l); if (x) return x.amount; }
  return null;
}
/** The text without its less phrases — what the reader shows the AI, so a less is never taken off twice. */
export function stripLess(text: string): string {
  return text.split('\n').map(l => { const x = lessIn(l); return x ? x.rest.replace(/\s{2,}/g, ' ').trim() : l; })
    .filter((l, i, a) => l.trim() || (i > 0 && a[i - 1].trim())).join('\n').trim();
}

// A mobile number (10 digits from 6–9, with or without +91, perhaps split 5 + 5).
const PHONE_SRC = String.raw`(?:\+?91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)`;
const PHONE = new RegExp(PHONE_SRC), PHONES = new RegExp(PHONE_SRC, 'g');
/** The numbers of 3 to 6 digits in a text ("1,450" counts as 1450): design numbers and prices, not phone or account numbers. */
export function numbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.replace(PHONES, ' ').matchAll(/\d[\d,]*/g)) {
    const d = m[0].replace(/,/g, '');
    if (d.length >= 3 && d.length <= 6) out.push(Number(d));
  }
  return out;
}
// A price said outright. "rs" counts next to a number only ("450rs", "Rs.550"), never inside a word.
const PRICED = /\b(rate|price|mrp)\b|₹|(?<![a-z])rs\.?\s*\d|\d\s*\/-|\d\s*rs(?![a-z])/i;
// How vendors mark a price or a design number in a short line, in English, Hinglish, Hindi and Gujarati.
const MARK = /\b(mrp|only|bhav|bhaav|rupees?|design|d\.?\s?no|dno|cat(?:alog(?:ue)?)?\.?\s?no)\b|@|(?<![a-z])rs(?![a-z])|रेट|भाव|दाम|कीमत|किंमत|ભાવ|કિંમત|રેટ|દામ/i;
// Bank details said outright: never about a product, whatever else the text holds (unless it names a price).
const BANK = /\b(ifsc|a\/c|acc(?:ount)?\.?\s*(?:no|number)|(?:payment|bank)\s+details)\b/i;
// Softer payment words: chatter only when the text holds no design number or price at all.
const PAY = /\b(bank|g\s?pay|google\s?pay|phone\s?pe|paytm|upi|neft|imps|qr\s?code)\b/i;
// A greeting, when the text OPENS with it (after an emoji or punctuation). "Welcome" is not one: "resellers most
// welcome" is in half the product posts, and a greeting word further inside a description says nothing.
const GREET = /^[^\p{L}\p{N}]*(good\s?(?:morning|night|evening|afternoon)|happy\s+\p{L}+|thanks?\b|congratulations|wishing\b|jai\s+\p{L}+|shubh\s+\p{L}+)/iu;

export const hasKeywords = (text: string) => KEYWORDS.test(text);
/** A caption that says its picture is not a product (a poster): a greeting, or bank details. A phone number or a
 *  payment word is NOT enough here — vendors caption product photos with "Order: 98765 43210". */
export function isPoster(text: string): boolean {
  const t = text.trim();
  if (!t || PRICED.test(t)) return false;
  return BANK.test(t) || (GREET.test(t) && !numbers(t).length && !hasKeywords(t));
}
/** A text message that is not about a product: the above, or a payment word / a short "call us" line with no
 *  design number, price or product keyword in it. Never a text that names a price. */
export function isChatter(text: string): boolean {
  const t = text.trim();
  if (!t || PRICED.test(t)) return false;
  if (isPoster(t)) return true;
  if (numbers(t).length || hasKeywords(t)) return false;
  return PAY.test(t) || (t.length < DESC_MIN && PHONE.test(t));
}
/** A short line with a design number and a price, without an English price word. */
const priced = (t: string) => { const n = numbers(t).length; return n >= 2 || (n === 1 && MARK.test(t)); };
export const isDescription = (text: string) => {
  const t = text.trim();
  return !isChatter(t) && ((t.length >= DESC_MIN && /\p{L}{3}/u.test(t)) || hasKeywords(t) || priced(t));
};
/** A caption sits on the product's own photo, so one design number or price is enough ("5081"). */
export const isCaption = (text: string) => isDescription(text) || (!isChatter(text) && numbers(text).length > 0);
// (A caption that is chatter but not a poster — a phone line — is simply not a description: the photo stays.)

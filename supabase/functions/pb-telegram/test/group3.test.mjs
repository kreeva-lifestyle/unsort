// node --test --experimental-strip-types supabase/functions/pb-telegram/test/
// Pre-launch fixes D15 / D16: short captions that were thrown away, chatter that was mixed into products,
// and grouping by the vendor's own clock instead of position alone. The numbered runs are the ones the
// launch check made (research notes, Telegram intake §4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isChatter, isDescription, plan, NO_DESC_MS, SETTLE_MS, SPLIT_GAP_MS } from '../group.ts';
import { isCaption, isPoster, numbers } from '../text.ts';

const T0 = Date.parse('2026-11-07T18:00:00Z');   // the night's burst arrives from here, 1.5 s apart
const DAY = Date.parse('2026-11-07T04:30:00Z');  // the vendor's own day starts here
const MIN = 60_000;
const DESC = 'LEHENGA CHOLI COLLECTIONS\nCODE :- KA-5070\nLEHENGA :- Georgette\nSIZE :- 42\nRATE :- 1600/-INR';
let seq = 0;
/** items: [kind, text, album, minute of the vendor's day it was posted (omit: not known)]. */
function feed(chat, startMid, items) {
  let mid = startMid;
  return items.map(([kind, text = '', album = null, min], i) => ({ id: ++seq, chat, mid: mid++, kind, text, album, at: T0 + i * 1500, ...(min === undefined ? {} : { ot: DAY + min * MIN }) }));
}
const photos = (n, album, min, caption = '') => Array.from({ length: n }, (_, i) => ['photo', i === 0 ? caption : '', album, min]);
const settled = (msgs) => msgs[msgs.length - 1].at + NO_DESC_MS;
const ids = (msgs, from, to) => msgs.slice(from, to).map(m => m.id);

test('D15: a short line with a design number and a price is a description, in the ways vendors write it', () => {
  for (const t of ['D.No 5081 Rama 450', '5081 @ 450', 'MRP 999', 'Only 450', '450rs', 'Design 5081 450 rs', 'Naya maal bhav 450 only',
    'नया माल आया है रेट 450', 'નવો માલ ભાવ 450', 'M L XL 550, XXL 600', 'D.No 7182 Rs.550', '450/-', '₹450', 'Naya maal rate 450', 'KB 302 WINE 1,450']) {
    assert.ok(isDescription(t), t);
  }
  for (const t of ['New colours', '👉👉', 'Diwali 2026', 'Only for wholesale', '2 pcs left', '10% less', 'Back side', 'नया डिज़ाइन']) assert.ok(!isDescription(t), t);
  // On the product's own photo one number is enough; a phone number is not a design number.
  assert.ok(isCaption('5081')); assert.ok(isCaption('Back side 5081')); assert.ok(!isCaption('Back side')); assert.ok(!isCaption('Call 98765 43210'));
  assert.deepEqual(numbers('KB 302 rate 1,450 call 9876543210 or +91 98765-43210, a/c 12345678901'), [302, 1450]);
});

test('D16: chatter is told apart from a description, and a text that names a price is never chatter', () => {
  for (const t of ['Payment details: A/c 1234567890 IFSC code SBIN0001234 GPay 9876543210', 'Good morning to all our dear customers, new stock tomorrow',
    'Thank you all for your love and support, keep shopping with us 🙏', 'Happy Diwali from all of us', 'For orders WhatsApp 98765 43210', 'UPI: shop@okbank']) {
    assert.ok(isChatter(t), t); assert.ok(!isDescription(t), t);
  }
  for (const t of [DESC, 'Good morning, new stock rate 450', 'Welcome to the new collection D.No 5081 fabric georgette 1450', 'GPay accepted. Rate 1450/-', 'Use code DIWALI10 on orders above the minimum',
    // Everyday product wording must never be taken for chatter (own review, before shipping):
    'Resellers most welcome', 'Pure georgette saree with blouse piece, heavy embroidery work, all colours available, resellers welcome',
    'Pure georgette saree, all colours, order on 9876543210', 'Georgette saree D.No 5081, 1450, payment by GPay only', 'New design, thank you for the response on 5081']) assert.ok(!isChatter(t), t);
  assert.ok(isDescription('Pure georgette saree with blouse piece, heavy embroidery work, all colours available, resellers welcome'));
  assert.ok(isDescription('Pure georgette saree, all colours, order on 9876543210'));
  // A picture is set aside only for a greeting or bank details on its caption, never for a phone number or a payment word.
  for (const t of ['Happy Diwali from all of us 🪔', '🙏 Thank you all', 'Good morning 🌞', 'Bank details: A/c 123456789012']) assert.ok(isPoster(t), t);
  for (const t of ['Order: 98765 43210', 'WhatsApp 9876543210', 'GPay accepted', 'Resellers most welcome', 'New arrival 🔥', 'Happy customers love 5081', 'Good morning, rate 450']) assert.ok(!isPoster(t), t);
});

test('a product photo captioned with a phone number or "resellers welcome" stays a product photo', () => {
  const m = feed(-2010, 1, [['photo', 'Order: 98765 43210', 'a', 10], ['photo', '', 'a', 10], ['photo', 'Resellers most welcome', null, 11], ['text', DESC, null, 11]]);
  const r = plan(m, settled(m));
  assert.equal(r.products.length, 1);
  assert.deepEqual(r.products[0].media, ids(m, 0, 3), 'all three photos are kept');
  assert.equal(r.products[0].description, DESC, 'the captions are not descriptions');
  assert.deepEqual(r.ignore, []);
});

test('a catalogue posted as single photos, each with its design number, is one product per photo', () => {
  const m = feed(-2011, 1, [['photo', '5081', null, 10], ['photo', '5082', null, 10], ['photo', '5083 @ 450', null, 11]]);
  const r = plan(m, settled(m));
  assert.deepEqual(r.products.map(p => p.description), ['5081', '5082', '5083 @ 450']);
  assert.deepEqual(r.products.map(p => p.media.length), [1, 1, 1]);
});

test('run 3: an album captioned "D.No 5081 Rama 450" keeps its caption as the description', () => {
  const m = feed(-2001, 1, [...photos(3, 'a', 10, 'D.No 5081 Rama 450')]);
  const r = plan(m, m[2].at + 4 * MIN);
  assert.equal(r.products.length, 1, 'final after the usual 3 quiet minutes, not after an hour with no text');
  assert.equal(r.products[0].description, 'D.No 5081 Rama 450'); assert.equal(r.products[0].noDescription, false);
  assert.deepEqual(r.products[0].media, ids(m, 0, 3));
  // Two captioned albums in a row are two products (they were one product with no text).
  const two = feed(-2001, 20, [...photos(2, 'a', 10, '5081 @ 450'), ...photos(2, 'b', 11, '5082 @ 480')]);
  const r2 = plan(two, settled(two));
  assert.deepEqual(r2.products.map(p => p.description), ['5081 @ 450', '5082 @ 480']);
  // A short text after the photos, the same way.
  const after = feed(-2001, 40, [...photos(2, 'a', 10), ['text', 'Design 5081 450 rs', null, 10]]);
  assert.equal(plan(after, settled(after)).products[0].description, 'Design 5081 450 rs');
});

test('run 1: photos of A with no text are not joined to B when the vendor posted them at another time', () => {
  const m = feed(-2002, 1, [...photos(3, 'a', 10), ...photos(3, 'b', 40), ['text', DESC, null, 40]]);
  const r = plan(m, settled(m));
  assert.equal(r.products.length, 2);
  assert.deepEqual(r.products[0].media, ids(m, 0, 3)); assert.equal(r.products[0].noDescription, true);
  assert.deepEqual(r.products[1].media, ids(m, 3, 6)); assert.equal(r.products[1].description, DESC);
  assert.equal(r.products[1].postedAt, DAY + 40 * MIN, 'when the vendor posted it is kept');
  // A is not held for an hour: the photos that follow show the vendor has moved on.
  assert.equal(plan(m, m[6].at + SETTLE_MS + 4 * MIN).products.length, 2);
  // Posted within minutes of each other, or with no times known: as before, by position (no guess is made).
  const close = feed(-2002, 20, [...photos(3, 'a', 10), ...photos(3, 'b', 12), ['text', DESC, null, 12]]);
  assert.equal(plan(close, settled(close)).products.length, 1);
  const blind = feed(-2002, 40, [...photos(3, 'a'), ...photos(3, 'b'), ['text', DESC]]);
  assert.equal(plan(blind, settled(blind)).products.length, 1);
  // One album is never split, however its parts are dated.
  const album = feed(-2002, 60, [['photo', '', 'x', 10], ['photo', '', 'x', 40], ['text', DESC, null, 40]]);
  assert.equal(plan(album, settled(album)).products[0].media.length, 2);
});

test('run 9: a poster posted in the morning is not the first photo of the next product', () => {
  const m = feed(-2003, 1, [...photos(2, 'a', 10), ['text', DESC, null, 10], ['photo', '', null, 200], ...photos(2, 'b', 330), ['text', `${DESC}\nnew`, null, 330]]);
  const r = plan(m, settled(m));
  assert.equal(r.products.length, 3);
  assert.deepEqual(r.products[1].media, [m[3].id]); assert.equal(r.products[1].noDescription, true, 'the poster is on its own, where a person can see and delete it');
  assert.deepEqual(r.products[2].media, ids(m, 4, 6));
});

test('a poster captioned with a greeting is not a product photo, nor is the rest of its album', () => {
  const m = feed(-2004, 1, [...photos(2, 'a', 10), ['text', DESC, null, 10], ...photos(2, 'p', 11, 'Happy Diwali from all of us 🪔'), ...photos(2, 'b', 12), ['text', `${DESC}\nnew`, null, 12]]);
  const r = plan(m, settled(m));
  assert.equal(r.products.length, 2);
  assert.deepEqual(r.products[0].extra, ids(m, 3, 5)); assert.equal(r.why[m[3].id], 'chatter'); assert.equal(r.why[m[4].id], 'chatter');
  assert.deepEqual(r.products[1].media, ids(m, 5, 7));
  // With no product before it, it is dropped with the same reason.
  const lone = feed(-2004, 30, [['photo', 'Good morning 🌞', null, 5]]);
  const r2 = plan(lone, settled(lone));
  assert.deepEqual(r2.ignore, [lone[0].id]); assert.equal(r2.why[lone[0].id], 'chatter'); assert.equal(r2.products.length, 0);
});

test('run 7: a greeting typed after a description is not added to it', () => {
  const hello = 'Thank you all for your love and support, keep shopping with us 🙏';
  const m = feed(-2005, 1, [...photos(2, 'a', 10), ['text', DESC, null, 10], ['text', hello, null, 11], ...photos(1, 'b', 12), ['text', `${DESC}\nnew`, null, 12]]);
  const r = plan(m, settled(m));
  assert.equal(r.products[0].description, DESC);
  assert.deepEqual(r.products[0].extra, [m[3].id]); assert.equal(r.why[m[3].id], 'chatter');
  // A second text that IS about the product still joins it.
  const more = feed(-2005, 30, [...photos(2, 'a', 10), ['text', DESC, null, 10], ['text', 'Dupatta: net with four side lace border and heavy tassels', null, 10]]);
  assert.match(plan(more, settled(more)).products[0].description, /Dupatta: net/);
});

test('run 8: bank details with the word "code" do not become a product', () => {
  const pay = 'Payment details: A/c 1234567890 IFSC code SBIN0001234 GPay 9876543210';
  const m = feed(-2006, 1, [...photos(2, 'a', 10), ['text', DESC, null, 10], ['other', '', null, 10], ['text', pay, null, 11]]);
  const r = plan(m, settled(m));
  assert.equal(r.products.length, 1);
  assert.ok(r.products[0].extra.includes(m[4].id)); assert.equal(r.why[m[4].id], 'chatter');
  // A priced text on its own is still its own product (as before).
  const priced = feed(-2006, 30, [...photos(1, 'a', 10), ['text', DESC, null, 10], ['other', '', null, 10], ['text', 'KA-5070 new rate 1500/- from today', null, 300]]);
  assert.equal(plan(priced, settled(priced)).products.length, 2);
});

test('D14: every message set aside carries why', () => {
  const m = feed(-2007, 1, [['other'], ['text', 'All sizes available, order fast before stock ends!!'], ['other'], ...photos(1, 'a'), ['text', DESC], ['other']]);
  const again = { ...m[3], id: ++seq };                                   // the same channel post forwarded twice
  const r = plan([...m, again], settled(m));
  assert.equal(r.why[m[0].id], 'separator');
  assert.equal(r.why[again.id], 'repeat');
  assert.equal(r.products.length, 1);
  // The unpriced text came first in the batch: a late description for assemble to judge (it is dropped there, with why).
  assert.equal(r.lateDesc.length, 1); assert.deepEqual(r.lateDesc[0].desc, [m[1].id]);
  const later = feed(-2007, 30, [...photos(1, 'a'), ['text', DESC], ['other'], ['text', 'All sizes available, order fast before stock ends!!'], ['other'], ...photos(1, 'b'), ['text', `${DESC}\nnew`]]);
  const r2 = plan(later, settled(later));
  assert.ok(r2.ignore.includes(later[3].id)); assert.equal(r2.why[later[3].id], 'no_photos', 'a text with no photos and no price');
  assert.ok(Object.keys(r2.why).length >= r2.ignore.length, 'nothing is ignored without a reason');
  for (const id of r2.ignore) assert.ok(r2.why[id], `ignored ${id} has a reason`);
  assert.equal(SPLIT_GAP_MS, 15 * MIN);
});

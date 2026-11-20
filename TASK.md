# Pending work

Everything still to do, for both divisions, in one place. One entry per
item: what it is, why it waits, and what happens next. When an item is
done (built, merged, deployed and checked, or done or decided by the
owner), its entry is deleted in the same change. The rules are in
`CLAUDE.md` → "Pending work — TASK.md".

Last checked: 20 Nov 2026.

## SuratMandi store — before it opens

Checked on 19 and 20 Nov 2026: every page, every button and the product
data. The store is still behind its password page with no orders, so no
shopper has seen any of this. The theme is also kept in the private
`suratmandi-theme` repository on GitHub; Claude changes it through Shopify.

### Your answers (Claude does the rest the same day)

- **S1 · Publish the saved theme version.** On 20 Nov Claude saved a new
  version of the theme: the home page shows your real categories and price
  bands, product pages show the description and questions, and the sample
  reviews, sample products and "Ships today" labels are gone. It is not
  live yet. Say yes and Claude publishes it.
- **S2 · Contact and legal details.** Every page's footer still shows
  blanks ("+91 98XXX XXXXX", "[Legal name]", "GSTIN [24XXX…]", "Grievance
  officer: [Name]"), and every WhatsApp button opens a number that does not
  exist. Give: WhatsApp number, support email, short address, support
  hours, registered name and address, GSTIN, grievance officer's name and
  email. Shopify holds two different street addresses: say which is the
  registered one.
- **S3 · Delivery charge.** Shopify charges ₹379 on every order (one rate,
  named in Hindi). The site says "free shipping above ₹999, otherwise ₹79".
  Decide: free, one flat charge, or free above an amount. Claude sets the
  rate, names it in English and makes the site say the same.
- **S4 · Cash on delivery.** The site promises COD on every page, "up to
  ₹10,000" with a "₹49 fee" and a WhatsApp confirmation. Payment settings
  cannot be read from outside. Say: is COD on, any limit, is a fee really
  charged (Shopify needs an app for that), do you confirm on WhatsApp.
- **S5 · Dispatch and delivery time.** The old theme said "Ships today",
  "Ready stock in 24 hours" and showed delivery dates; your Playbook store
  profile says "Ships in 5 to 7 days". The saved version shows no dispatch
  promise at all. Give the real dispatch days (one for all, or by product)
  and the courier days. Claude puts them in the theme, the listings and the
  shipping policy.
- **S6 · Exchange and returns.** "7-day exchange" is promised on every page
  and in about 300 listings, but the store has no returns, shipping or
  terms policy: those three footer links open "page not found". Give the
  rule (how many days, exchange or refund, who pays the courier, what is
  excluded). Claude writes the policies and matches the site to them.
- **S7 · "Made in our Surat unit", "factory price", "every piece checked by
  hand".** These lines are on every page and in about 140 listings, while the
  products come from other sellers' websites. Say what is true for every
  product; Claude rewords the rest, on the site and in Playbook's writer.
- **S8 · Best Price Promise** ("Found it cheaper? We refund the
  difference"). It is on every page; its terms page holds only a writing
  instruction. Say yes with terms (which websites, how to claim, how it is
  paid), or no and Claude removes every mention.
- **S9 · Offers FLAT150, FIRST10, SET5 and PREPAID.** They showed on every
  product and in the cart with "Tap to apply", but the store has no
  discounts. Claude switched them off on 20 Nov. Say which are real; Claude
  creates the discounts and shows only those. (Money off for paying online
  needs an app.)
- **S10 · Wholesale.** The site says "cheaper at 4+ pieces", "GST invoice in
  your business name", "plain packing", "dispatch in 24 hours" and "we
  reply within 2 working hours", and the cart asks for a GSTIN. Nothing in
  the store lowers a price at 4 pieces. Say whether this website sells
  wholesale and the rule; otherwise Claude removes the wholesale parts.
- **S11 · Telegram and WhatsApp channels for shoppers.** The site invited
  them to "new designs daily at 11 am" with no link; the saved version
  hides it. Give the links if the channels exist.
- **S12 · GST line on product pages.** They print "Inclusive of all taxes
  (18% GST)" above ₹2,500 and "(5% GST)" up to ₹2,500, worked out from the
  price alone. Confirm with your accountant, or Claude prints only
  "Inclusive of all taxes".
- **S13 · Size guide.** The page shows sample numbers in brackets. Give real
  bust, waist and hip per size, or say that sizes differ by supplier.
- **S14 · About page.** It reads "[Write your factory story here.]". Give
  the story, a photo and real numbers, or Claude hides the page.
- **S15 · Kids Wear and Men's Kurta.** Both category pages exist and are
  empty. Selling these at launch? If not, Claude hides them until the first
  product arrives.
- **S16 · Small choices.** Product pages show the supplier's design code as
  "SKU" (keep or hide?). The name is written three ways (SuratMandi,
  suratmandi, Surat Mandi). The footer says "Powered by Shopify" and the
  stamp says "EST. SURAT".

### Only you can do

- **Payments.** Shopify → Settings → Payments: check the online gateway and
  Cash on Delivery, then place one test order of each kind.
- **Filters.** Install Shopify's free "Search & Discovery" app. Category
  pages offer only Availability and Price today; with it Claude adds size,
  colour and fabric.
- **Reviews.** The site shows no reviews now (the samples are removed).
  Install a reviews app after the first orders.
- **Courier and tracking.** No courier app is installed, and "Track order"
  is only a sign-in button.
- **A mailbox on your domain.** Store emails are sent from a personal Gmail
  address, and the privacy policy names it.
- **₹ sign.** Prices print "Rs." beside the theme's "₹". Shopify → Settings
  → General → Store currency → Change formatting.
- **Logo, tab icon, share picture and the home page's search text.**
  Settings → Brand, and Online Store → Preferences. Claude can write the
  text.
- **Opening-day email.** The password page promises one to everyone who
  leaves an email there.
- **Remove the password page** last, when the entries above are settled.

### Claude fixes next on the store (no answer needed)

- **Phone filters.** After ticking a filter or typing a price in the filter
  panel, the page stops scrolling (read from the code; to be tested on a
  phone). Search results on a phone cannot be filtered or sorted.
- **Cart.** A GSTIN typed in the cart is wiped by any cart change. A code
  that does not exist is shown as "saved". A double tap on the bin can
  remove two items, and on "+ Add" can add two.
- **Wishlist and "Recently viewed".** Their product cards stay faded, as if
  still loading.
- **Weak connection.** A size change that fails keeps the earlier size in
  the cart, and most failed taps show no message.
- **Choosing a size.** The first size is picked for the shopper, and "+ Add"
  on a card puts a one-size product straight into the cart. Cards print odd
  size text ("38"–38"", "Free Size–Free Size").
- **Empty and odd pages.** An empty category says "No designs match these
  filters". The all-products page is headed "Products" and sorted A to Z.
  The blog shows a bare heading. A wishlist of removed designs is blank.
- **Product page.** The path at the top says "All designs" for every
  product; it should name the product's own category.
- **Enquiry form.** It can be sent with "[name]" and "[city]" unfilled, and
  its smallest quantity is 20.
- **Small bugs.** Clearing the search box leaves an empty list. The cart
  icon on the cart page opens the cart over itself. Page 2 of a category
  loads without moving up. The home banner may not swipe on phones. Saved
  hearts look unsaved after filtering. Dispatch dates come out a day early
  on Sunday mornings (matters once S5 is set).
- **Policy pages** have no spacing; phone and email are not tappable (after
  S2).
- **Details on the product page** lack Colour, Type and "In the set",
  though Playbook sends them.
- **Category pages** have no description, picture or search text.

## Playbook → SuratMandi: gaps to fill

What Playbook does not send to the store, or does not keep right once a
product is live (checked against the code and all 504 store products,
19 and 20 Nov 2026).

### Claude builds next (no answer needed)

- **A category change does not reach products already on the store.**
  Rename or move a category, or change a live product's category, and the
  product stays in its old collection; only Regenerate moves it, one
  listing at a time and with a new AI text. Next: the change is sent by
  itself, without the AI.
- **Tag and field changes are not sent by themselves.** A corrected colour,
  fabric, work or occasion waits for the listing's next send ("Update on
  Shopify" does it for one listing); tags change only when the AI writes
  the listing again. Next: both are sent when they change, plus one button
  per website, "Send tags and fields again".
- **Sizes are named six ways** ("M (38)", "38"", "40 Size", "2XL"…). Next:
  one format on every product.
- **Another website's word in Product Type.** 34 products show "WOMEN
  FASHION". Next: a real type or nothing.
- **Titles.** They use the category name ("…Suits & Dresses"), stack
  occasion words, and different designs can share one title. Next: see
  "Suits & Dresses" under follow-ups.
- **Care, "in the set" and net quantity.** The product page has places for
  them; Playbook writes the facts but does not send these fields.
- **Pre-draped sarees filed under Saree** (7 products), so Pre-Stitched
  Saree shows only 5.
- **Work and Occasion go as one line of text** ("Festival, Wedding"), so
  they cannot be filters. Next: sent as lists (needs the Filters app above).
- **Tags.** Raw supplier words reach the store (spelling twins, mill names,
  sentence-long tags), and the limit of 8 tags can cut an occasion.
- **Leftovers.** A value, "set contents" or question removed in Playbook
  stays on the store, and renaming an attribute starts a new field while
  the old one stays.
- **Collections.** A new category gets its collection only when "Set up on
  Shopify" is tapped again. Collections get no description or picture, an
  empty one stays public, and no menu link is added. Next: Playbook also
  keeps each collection's lowest price for the "from ₹…" labels.
- **No SKU without a design code.** Such a product goes out with no SKU and
  no barcode, so an order names neither the vendor nor the design.
- **Photos.** The AI describes the first 8 photos; the rest get the stand-in
  text "<title> - view 9", and a photo added later gets none. A listing can
  also carry photos of another colour.
- **Weight.** 23 products weigh 0. Next: a usual weight per category when
  the source gives none.
- **Edits made in Shopify are not noticed.** The next send replaces the
  title, description, prices and sizes typed there. Next: a nightly check
  that says what differs.

### Needs your decision first

- **Stock.** No stock numbers are sent. A product marked In stock shows 0
  on the store and keeps selling in every size; Out of stock makes every
  size "Sold out". One switch covers all sizes, and orders never reach
  Playbook, so it does not know what sold. Decide: is everything bought
  after the order comes, or do you hold stock per size?
- **Dispatch on each product** (after S5), and **bulk price and full sets**
  (after S10): the theme has places for them, and Playbook sends none.
- **The store's legal fields.** HSN code, "lowest price in 30 days" and
  "sold in 30 days" stay empty on every product. Generic name (the
  category) and country of origin (India) are printed by the theme itself.
  Say whether Playbook should send them as real values.
- **Listing promises.** About 500 search descriptions say "Ships in 5 to 7
  days" and about 300 "exchange within 7 days"; some say "stitched to
  measure", "Swarovski" or "100% pure". They come from the store profile
  and the suppliers' text. After S5, S6 and S7 the writer uses your exact
  words and the listings are written again.
- **Where products are sold.** Only the Online Store. Say if the Shop app,
  Google or Instagram should get them too.
- **Supplier tag.** Once vendor short names are entered, products get a
  public tag such as "Vendor_KB". Keep it or drop it?

## Playbook — decisions the owner still has to make

Most come from the launch research report sent on 13 Nov 2026 (questions
Q1 to Q20; the report itself is not in this repository). Each entry gives
the recommendation; once decided, Claude builds it.

The entries before Q3 are small ones about tags and photos (most from the
tags research report of 13 Nov, "Scrape mapping to Playbook taxonomy").

- **121 products wait for a category** ("Missing: Category"): Anarkali 96,
  Kurta Set 23, Gown 1, Indo-Western 1 — categories taken off the list.
  Settings → Tags → Categories → **Waiting for a category**: tap each and
  move its products (Anarkali and Kurta Set → Salwar Suit). Link Product
  Type to Salwar Suit first, so the rules and the AI choose Anarkali or
  Kurta Set for them there.
- **Product Type: check each category's types.** It is "only if it fits"
  now (18 Nov): the AI gives a type only when one truly fits, else the
  product goes out without one. Lehenga has just 3 types (Bridal Lehenga,
  South Indian Lehenga, Crop Top & Skirt), so most lehengas get none. Add
  the kinds you sell under Settings → Tags → Product Type if you want them.
- **Two colours ("Pink and White"):** Multicolour, or the main colour?
  Colour takes one value.
- **Wrong "also known as" words left by the old word rules:** Back → Black,
  Brunches → Art Silk, Light Volume → Blue, Koti → Khatli Work, Choli Set / Koti
  Set → Dhoti Set, Printed Saree → Pant Saree, Straight pants → Straight
  Suit, Teal/Pearl Blouse → Khatli Work, Heavy Zari/Zari Line → Stone Work.
  New words no longer use those near-spelling matches. Say yes and these
  are taken off and the products tagged again.
- **Photo previews are over the monthly free quota.** Supabase "Storage
  Image Transformations" shows 125 of 100 for this billing month. Choose:
  switch the spend cap off in Supabase (about $5 for each extra 1,000
  photos), or let Claude build stored thumbnails so previews stop using the
  paid resizer. Until then a preview can show the full-size photo instead.
- **Q3 · Alerts.** When something breaks and nobody is looking, where does
  the message go? Recommended: a morning summary, plus an instant Telegram
  message when work is stuck for 15 minutes, when Failed or Needs review
  passes a number you set, when Shopify refuses a store's key, or when no
  Telegram post arrives after a crawl night. (The dashboard warnings and the
  ₹500 daily AI limit are already built.)
- **Q4 · Who may start large actions.** Today any staff member can import
  up to 5,000 products, send or re-price a whole website, retry everything
  and read everything again. Recommended: admins and managers only.
- **Q5 · The crossed-out "was" price.** Each website can now show one % or
  a random % per product (13 Nov). Recommended: use it only for the true
  MRP, or leave it off, and keep a log of price changes (new rules from
  1 Jan 2027). On SuratMandi the theme prints it as "MRP" with a "% OFF"
  label on every product, on the home page ("Up to 44% off MRP") and in the
  legal details.
- **Q7 · A vendor posts a product again.** Today the earlier product gets
  its stock back and the new post waits in Needs info as a copy.
  Recommended: update the existing product automatically on a clear match
  (same vendor, same design code, at least one matching photo, colour not
  different); ask once with one tap when unclear.
- **Q8 · A repeat post with a new rate.** Recommended: apply it
  automatically within a band you choose (10% to start) and re-price the
  live listings; one tap for a bigger change.
- **Q9 · A re-post after a permanent stock-out.** Today a new product is
  made. Recommended: bring the old product back (same page and address).
- **Q10 · "New arrival" tag.** You asked for it on 12 Nov (products of the
  last 30 days). The upload date is recorded now; the tag is not built. To
  settle first, recommended: 30 days from when a product first goes live on
  a store (a setting per store), no tag for the 136 imported products, a new
  colour counts as new, a restock does not. Until it is built, the store's
  New arrivals page lists every product, newest first (set on 20 Nov).
- **Q14 · One post showing several colours.** Today it becomes one
  product. Recommended: one product per colour when the post names its
  colours; decide after the first week of real Telegram posts.
- **Q17 · Archiving a product.** Today its listings stay on sale.
  Recommended: archiving also takes its listings off the stores, as Remove
  from site does.
- **Q19 · Colours of one design on the store.** Recommended for later:
  link them with colour swatches by design code (Shopify's built-in way is
  for Plus stores only).
- **Q20 · Public repository.** It has to stay public while the server
  functions load their code from GitHub. Making it private first needs
  another way to deploy them; say if you want that.

## Playbook — follow-ups Claude builds next

Found in the overnight check of 19 Nov; built in the next Playbook change.

- **"Suits & Dresses" reads badly in listings.** The search phrase uses
  the category's name, so titles say "Purple Georgette Suits & Dresses…"
  and descriptions "This Maroon Suits & Dresses set…". Next: the product's
  Product Type (Gown, Anarkali…) when it has one, else a plain word for the
  category. Also: one occasion word in a title at most, and no two
  designs with the same title.
- **4 SuratMandi listings held for "copied wording" that is only the
  product's facts** ("pure micro cotton full lining with canvas belt
  attached"). Next: words that are the product's own facts no longer count
  as copied, and the 4 are written again. Until then they wait in Needs
  review; Approve them if they read well.

## Playbook — things only the owner can do

- **Delete the old `program-voice-notes` storage bucket.** Supabase →
  Storage: it still holds 2 files that nothing uses (security check, 13 Nov).
- **Enter the vendor's short names.** Playbook → Vendors → Kashtbhanjan:
  add **KB** and **NKB**. Repeat posts and stock notices are matched by them;
  the list is empty today.
- **Set up Telegram.** Link the staff group (the bot must be an admin),
  then Kashtbhanjan's channel (it needs a public name). Run the nightly
  crawler from a separate, long-established staff account, not your own
  number (Q11), and install crawler 1.2.0 on that computer. Recommended
  start: no old posts for this vendor (Q12) and one check a night (Q13).
- **When Telegram products start (Q1, Q18).** SuratMandi is connected and
  on Live. Put it on "Review first" for the first week of Telegram
  products, and check the first Telegram product and the first stock notice
  by hand.
- **Before the first paid order (Q2, Q6).** Written permission to use the
  suppliers' photos, and tax settings for the two GST rates on stitched
  garments (5% up to ₹2,500 a piece, 18% above). Settle these with your
  accountant and lawyer. The seller's details and the policy pages are S2
  and S6 above.

## Playbook — later (owner said not now)

- **HSN codes on products** ("HSN code will set later", 12 Nov).
- **Photo pipeline that changes backgrounds and faces** before photos go to
  the stores ("Currently just leave google flow pipeline", 12 Nov).

## DailyWork

- Nothing pending.

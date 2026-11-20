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

- **Theme repository.** Since 20 Nov the live theme is the one named
  `suratmandi-theme/staging` (it holds the new version: real categories and
  price bands, your answers of 20 Nov, no sample content). Whoever works in
  the `suratmandi-theme` repository must work on its `staging` branch, or
  bring `staging` into `main` and publish `main` again; an upload to `main`
  alone no longer reaches the live store.
- **S2 · The rest of the contact and legal details.** The name and the
  WhatsApp number are in. Still missing, and hidden on the site until you
  give them: support email, short address, support hours, registered
  address (Shopify holds two different street addresses: say which),
  GSTIN, and the grievance officer's name and email.
- **S6 · Policies copied from ethnicvilla.com.** You asked for this on
  20 Nov. Claude could not open that website: this workspace's network
  list does not allow it. Either add ethnicvilla.com under "Allowed
  domains" in the cloud environment's network settings, or paste the
  policy text into the chat. Claude then writes the shipping, exchange and
  returns, terms and privacy policies for SuratMandi from it and makes the
  site's promises ("7-day exchange" on every page and in about 300
  listings) say the same. Until then those three footer links open "page
  not found".
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
  bust, waist and hip per size, or say that sizes differ by supplier. (See
  also "Sizes: with or without inches" further down.)
- **S14 · About page.** It reads "[Write your factory story here.]". Give
  the story, a photo and real numbers, or Claude hides the page. On the
  live theme the two unfinished blocks under it are hidden ("[Write your
  factory story…]" and "[0] [real number]"); the page's own line still
  shows.
- **S15 · Kids Wear and Men's Kurta.** Both category pages exist and are
  empty (the saved version leaves them out of the category list). Selling
  these at launch? If not, Claude hides them until the first product
  arrives.
- **S16 · Small choices.** Product pages show the supplier's design code as
  "SKU" (keep or hide?). The name is written three ways (SuratMandi,
  suratmandi, Surat Mandi). The footer says "Powered by Shopify" and the
  stamp says "EST. SURAT".

### Only you can do

- **Payments and one test order.** Nobody has opened the checkout yet.
  Shopify → Settings → Payments: the gateway must be live (not in test, KYC
  done) and Cash on Delivery set as you want. Settings → Checkout: make the
  phone number required (couriers need it). Then, on your phone, place one
  prepaid and one COD order from the menu to the "thank you" page, and tell
  Claude: it reads the order's delivery charge, tax and GSTIN, and the
  emails the shopper gets.
- **Free delivery for prepaid orders only.** Shopify now charges ₹70
  ("Standard delivery"; it was still ₹379 on 20 Nov) and offers "Free
  delivery (prepaid orders only)" on orders of ₹5,000 and above. Shopify
  itself cannot stop a shopper from picking the free rate and then paying
  cash. Install a payment-rules app from the Shopify App Store (search
  "hide payment methods") and set: hide Cash on Delivery when the free
  delivery rate is chosen. Tell Claude when it is in.
- **Filters.** Install Shopify's free "Search & Discovery" app. Category
  pages offer only Availability and Price today; with it Claude adds size,
  colour and fabric.
- **Reviews.** The saved version shows no reviews (the samples are
  removed). Install a reviews app after the first orders.
- **Courier and tracking.** No courier is chosen: get its list of pincodes
  (prepaid and COD) and its rates. "Track order" is only a sign-in button
  until a courier app sends tracking.
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
  size text ("38–38", "Free Size–Free Size").
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
  on Sunday mornings (matters only if products get their own dispatch
  day).
- **Policy pages** have no spacing; phone and email are not tappable (after
  S2).
- **Details on the product page** lack Colour, Type and "In the set",
  though Playbook sends them.
- **Category pages** have no description, picture or search text.
- **Still to check.** Product photos for a supplier's logo, watermark or
  phone number; page speed; how the site reads for weak eyesight; what
  search engines will list on opening day; tablet screens. The phone menu,
  cart and filter panels were read from the code, never tapped: your test
  order covers them.

## Playbook → SuratMandi: gaps to fill

What Playbook does not send to the store, or does not keep right once a
product is live (checked against the code and all 504 store products,
19 and 20 Nov 2026).

### Claude builds next (no answer needed)

- **Another website's word in Product Type.** 34 products show "WOMEN
  FASHION". Next: a real type or nothing.
- **Titles.** They use the category name ("…Suits & Dresses"), stack
  occasion words, and different designs can share one title. Next: see
  "Suits & Dresses" under follow-ups.
- **Care, "in the set" and net quantity.** The product page has places for
  them; Playbook writes the facts but does not send these fields.
- **Pre-draped sarees filed under Saree** (7 products), so Pre-Stitched
  Saree shows only 5. Change their category in Playbook and the store
  moves them by itself.
- **Work and Occasion go as one line of text** ("Festival, Wedding"), so
  they cannot be filters. The store's own two fields are text fields.
  Next: Claude makes them list fields; Playbook then sends lists by itself.
- **Tags.** Raw supplier words reach the store (spelling twins, mill names,
  sentence-long tags), and the limit of 8 tags can cut an occasion.
- **Leftovers.** From 20 Nov a value removed in Playbook is taken off the
  store too, for every field Playbook has sent since then. What was left
  behind earlier stays: an old value or "set contents" removed before that
  day. Still open: when every question of a listing is removed, the old
  questions stay on the store (removing some of them works).
- **Collections.** A new category gets its collection when "Set up on
  Shopify" is tapped again, or when a product already on the store moves
  into it. Collections get no description or picture, an empty one stays
  public, and no menu link is added. Next: Playbook also keeps each
  collection's lowest price for the "from ₹…" labels.
- **No SKU without a design code.** Such a product goes out with no SKU and
  no barcode, so an order names neither the vendor nor the design.
- **Photos.** The AI describes the first 8 photos; the rest get the stand-in
  text "<title> - view 9", and a photo added later gets none. A listing can
  also carry photos of another colour.
- **Weight.** 23 products weigh 0. Next: a usual weight per category when
  the source gives none.
- **Edits made in Shopify are not noticed.** The next send replaces the
  title, description, prices and sizes typed there, and the product type
  and Playbook's own tags and fields follow Playbook by themselves (tags
  typed in Shopify stay). Next: a nightly check that says what differs.
- **A live listing whose re-send fails is written again by the AI** the
  next time its product is checked, which costs money and changes its
  text. Next: it is sent again as it is.
- **Shopify's own "category" box** (not the collection) is filled when a
  product is first sent and does not follow a later category change.
- **A renamed collection keeps the rule for its old name.** If that old
  name is used again for another category later, its products also show in
  the renamed collection. Next: the old rule is taken off once no product
  on the store has the old name.
- **A new collection that Shopify would not show** (made, but the Online
  Store step failed) stays hidden and nothing says so. Next: the step is
  tried again and the listing says why.
- **A product Shopify keeps refusing** (its category, tags or fields) is
  tried again every 5 minutes for as long as it takes; its listing says
  why. Next: after the third refusal it waits an hour between tries.
- **Messages while automation is paused.** "Send tags and fields again"
  says the products wait for automation, but the product page, the Tags
  page and Bulk changes still say "within a few minutes" while it is
  paused. Next: they say it waits too.
- **AI tags before approval.** On a "Review first" website, the extra tags
  of a rewrite that still waits for your approval can reach the store with
  the next tag update. Next: they wait for the approval too.
- **Listing promises.** About 500 search descriptions say "Ships in 5 to 7
  days"; your answer of 20 Nov is "Delivery within 5 to 7 days". Next:
  Claude changes the store profile line and those descriptions. About 300
  say "exchange within 7 days": they wait for the policies (S6). Some say
  "stitched to measure", "Swarovski" or "100% pure": from the suppliers'
  text, checked when the listings are next written.

### Needs your decision first

- **Sizes: with or without inches.** From 20 Nov every size is written one
  way: the letter in capitals ("M"), with the inches in brackets when the
  supplier gave them ("M (38)"), a plain number when only inches were given
  ("38"), or "Free Size". Playbook never adds inches a supplier did not
  give, so "M" (about 120 products) and "M (38)" (about 135) both stay.
  Say "letters only" to drop the inches everywhere, or give your own chart
  (XS 34 … XXL 44?) and say every M should read "M (38)".
- **Stock.** No stock numbers are sent. A product marked In stock shows 0
  on the store and keeps selling in every size; Out of stock makes every
  size "Sold out". One switch covers all sizes, and orders never reach
  Playbook, so it does not know what sold. Decide: is everything bought
  after the order comes, or do you hold stock per size?
- **Dispatch on each product** (today one line for all: "Delivery within 5
  to 7 days"), and **bulk price and full sets** (after S10): the theme has
  places for them, and Playbook sends none.
- **Generic name and country of origin.** Each product's legal details
  print the category as its generic name and "India" as its country: the
  theme's own stand-ins, the same on every product. Say if that is right
  for all, or Playbook should send them per product. (HSN is under
  "later".)
- **Where products are sold.** Only the Online Store. Say if the Shop app,
  Google or Instagram should get them too.
- **Supplier tag.** Once vendor short names are entered, every listing,
  also the ones already on the store, gets a public tag such as
  "Vendor_KB" within minutes, and each loses one other tag (they are at the
  limit of 8). Keep it or drop it? Answer this before entering the names
  (below).

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
  up to 5,000 products, send or re-price a whole website, send its tags
  and fields again, retry everything and read everything again. Recommended: admins and managers only.
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
  the list is empty today. First answer "Supplier tag" above: once the
  names are in, the 134 products of this vendor on SuratMandi get a public
  "Vendor_KB" tag within minutes.
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

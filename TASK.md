# Pending work

Everything still to do, for both divisions, in one place. One entry per
item: what it is, why it waits, and what happens next. When an item is
done (built, merged, deployed and checked, or done or decided by the
owner), its entry is deleted in the same change. The rules are in
`CLAUDE.md` → "Pending work — TASK.md".

Last checked: 13 Nov 2026.

## Playbook — decisions the owner still has to make

Most come from the launch research report sent on 13 Nov 2026 (questions
Q1 to Q20; the report itself is not in this repository). Each entry gives
the recommendation; once decided, Claude builds it.

The first eight come from the tags research report of 13 Nov ("Scrape
mapping to Playbook taxonomy"). All are small; each changes how products
are tagged.

- **Salwar Suit and Gown have no tags linked.** Their 12 products show
  Ready with no tags. In Settings → Tags, link the attributes they need, or
  tell Claude they need none.
- **One product is still filed as Indo-Western**, a category you removed.
  It now waits in Needs info ("Missing: Category"): choose its category.
- **What makes Anarkali, Kurta Set, Salwar Suit and Co-ord Set different?**
  One line each (the cut of the top, the kind of bottom). Similar sets were
  filed three different ways; with these lines the rules and the AI file
  them the same way every time.
- **Teal, Rust, Mustard, Mauve:** new Colour values, or part of an existing
  colour (Teal → Blue, Rust → Orange…)? 18 products have no exact colour.
- **Two colours ("Pink and White"):** Multicolour, or the main colour?
  Colour takes one value.
- **Crunchy, Roman, Glass, Fendy, Rangoli and Vichitra silk:** new Fabric
  values, or Silk / Art Silk? 27 products are only "some silk" today.
- **"Wedding":** add it back as another name for Marriage? A deleted word
  comes back as a question every time it is seen.
- **Occasion:** let the AI judge it (suppliers never say), or set a default
  per category?
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
- **Q5 · The crossed-out "was" price.** Recommended: use it only for the
  true MRP, or leave it off, and keep a log of price changes (new rules from
  1 Jan 2027).
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
  colour counts as new, a restock does not.
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

## Playbook — approved, being built

- **Put the 13 Nov tag work live on the server:** the three tag fixes, the
  better word rules and the remembered category choices (the AI follows how
  you filed earlier products from the same website or vendor; no word cards,
  owner 13 Nov). All merged, but the database change
  (`20261113150000_pb_gate_category_list.sql`) and the server update wait:
  Claude's Supabase connection was down on 13 Nov. Until then the old
  behaviour stays. Next: Claude applies both as soon as the connection is
  back, then checks them.

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
- **Create the Shopify app with `write_inventory`** next to the other
  permissions: sending stock changes needs it.
- **Connect the first store step by step (Q1, Q15, Q18).** First a
  development store on Draft with automation paused; send one product by
  hand and check it in Shopify. Then the real store, on "Review first" for
  the first week of Telegram products. Switch Stock off and on once and note
  the words your theme shows. Check the first real product and the first
  stock notice by hand.
- **Before the first paid order (Q2, Q6).** Written permission to use the
  supplier's photos; the seller's legal name and address, a grievance
  officer, return, refund, shipping and payment pages, country of origin in
  words, and tax settings for the two GST rates on stitched garments (5% up
  to ₹2,500 a piece, 18% above). Settle these with your accountant and
  lawyer.

## Playbook — later (owner said not now)

- **HSN codes on products** ("HSN code will set later", 12 Nov).
- **Photo pipeline that changes backgrounds and faces** before photos go to
  the stores ("Currently just leave google flow pipeline", 12 Nov).

## DailyWork

- Nothing pending.

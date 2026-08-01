#!/usr/bin/env python3
"""
boutique_leads.py — lead generation for Indian ethnic wear boutiques abroad.

Finds boutiques (potential wholesale clients for a Surat lehenga choli
manufacturer) by searching Google Maps for each search term in each target
city, enriches results with emails / Instagram handles from the boutiques'
own websites, dedupes, and writes one Excel workbook.

USAGE
    pip install playwright xlsxwriter
    playwright install chromium

    python boutique_leads.py                          # all cities in CONFIG
    python boutique_leads.py --cities "Leicester UK"  # just one city
    python boutique_leads.py --resume                 # continue after a stop

OUTPUT
    boutique_leads.xlsx   Leads / Summary / Failed sheets
    .leads_checkpoint.json  progress checkpoint (safe to delete to start over)

HONEST NOTES
    * This automates Google Maps through a real browser. Google's terms do not
      permit automated access; run it for your own business research, keep the
      built-in delays, and expect that Google may throttle you or change their
      page structure (in which case the SELECTORS section below needs a touch-
      up). If it breaks permanently, the supported route is the paid Google
      Places API.
    * Emails are only collected from what businesses publish on their OWN
      websites' home/contact pages.
"""

import argparse
import json
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════
# CONFIG — edit these
# ═══════════════════════════════════════════════════════════════════════════

target_cities = [
    "Leicester UK",
    "Southall London UK",
    "Edison NJ USA",
    "Artesia CA USA",
    "Brampton Canada",
    "Dubai UAE",
]

search_terms = [
    "indian clothing boutique",
    "lehenga shop",
    "desi fashion store",
    "asian bridal wear",
    "saree shop",
]

OUTPUT_XLSX = "boutique_leads.xlsx"
CHECKPOINT = ".leads_checkpoint.json"
ENRICH_TIMEOUT = 10          # seconds per website fetch
DELAY_RANGE = (2.0, 5.0)     # random wait between browser actions
MAX_SCROLL_ROUNDS = 60       # safety cap while loading "all" results

# ═══════════════════════════════════════════════════════════════════════════
# Small helpers
# ═══════════════════════════════════════════════════════════════════════════

def human_pause():
    time.sleep(random.uniform(*DELAY_RANGE))

def log(msg):
    print(msg, flush=True)

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Files that regex-match emails but aren't (logo@2x.png etc.)
EMAIL_JUNK = re.compile(r"\.(png|jpe?g|gif|webp|svg|css|js)$", re.I)
INSTA_RE = re.compile(r"instagram\.com/([A-Za-z0-9._]{2,30})", re.I)
INSTA_JUNK = {"p", "reel", "reels", "explore", "stories", "accounts", "sharer"}

def normalize_name(name):
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())

def normalize_phone(phone):
    return re.sub(r"[^0-9]", "", phone or "")[-10:]  # last 10 digits

def priority_of(lead):
    try:
        rating = float(lead.get("rating") or 0)
        reviews = int(lead.get("reviews") or 0)
    except (TypeError, ValueError):
        rating, reviews = 0.0, 0
    if rating >= 4.0 and reviews >= 20 and lead.get("website"):
        return "High"
    if lead.get("website") or (rating >= 4.0 and reviews >= 5):
        return "Medium"
    return "Low"

# ═══════════════════════════════════════════════════════════════════════════
# Checkpoint (resume support)
# ═══════════════════════════════════════════════════════════════════════════

def load_checkpoint():
    p = Path(CHECKPOINT)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            log("!! checkpoint file unreadable — starting fresh")
    return {"done_cities": [], "leads": [], "failed_sites": []}

def save_checkpoint(state):
    Path(CHECKPOINT).write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")

# ═══════════════════════════════════════════════════════════════════════════
# SELECTORS — the part most likely to need updating when Google changes
# ═══════════════════════════════════════════════════════════════════════════

SEL_FEED = "div[role='feed']"                    # scrollable results panel
SEL_CARD_LINK = "a[href*='/maps/place/']"        # one per result card
SEL_END_MARKER = "You've reached the end"        # text at list bottom
SEL_CONSENT_BTNS = (                             # cookie/consent popups by label
    "Accept all", "Reject all", "I agree", "Alle akzeptieren",
)
# On a place page, details carry stable data-item-id attributes:
SEL_ADDRESS = "button[data-item-id='address']"
SEL_WEBSITE = "a[data-item-id='authority']"
SEL_PHONE = "button[data-item-id^='phone']"

def dismiss_consent(page):
    """Google shows region-dependent consent walls; click through politely."""
    for label in SEL_CONSENT_BTNS:
        try:
            btn = page.get_by_role("button", name=label)
            if btn.count() > 0:
                btn.first.click(timeout=2000)
                human_pause()
                return
        except Exception:
            pass  # no popup / already gone

# ═══════════════════════════════════════════════════════════════════════════
# Scraping
# ═══════════════════════════════════════════════════════════════════════════

def collect_result_links(page):
    """Scroll the results feed until the end marker (or it stops growing),
    then return de-duplicated [(name, maps_link, rating, reviews), ...]."""
    try:
        page.wait_for_selector(SEL_FEED, timeout=15000)
    except Exception:
        return []  # zero results for this query

    feed = page.locator(SEL_FEED)
    prev_count, stable = -1, 0
    for _ in range(MAX_SCROLL_ROUNDS):
        cards = page.locator(SEL_CARD_LINK)
        count = cards.count()
        if SEL_END_MARKER.lower() in (feed.inner_text() or "").lower():
            break
        # lazy-loading can stall for a beat, so one flat round isn't proof
        stable = stable + 1 if count == prev_count else 0
        if stable >= 2:
            break
        prev_count = count
        feed.evaluate("el => el.scrollBy(0, el.scrollHeight)")
        human_pause()

    results, seen = [], set()
    cards = page.locator(SEL_CARD_LINK)
    for i in range(cards.count()):
        card = cards.nth(i)
        try:
            href = card.get_attribute("href") or ""
            name = card.get_attribute("aria-label") or ""
            if not href or not name or href in seen:
                continue
            seen.add(href)
            # Rating + reviews live in a sibling aria-label like
            # "4.6 stars 132 Reviews"; missing on unrated places.
            rating, reviews = "", ""
            try:
                rate_el = card.locator("xpath=..").locator("span[role='img']")
                if rate_el.count() > 0:
                    label = rate_el.first.get_attribute("aria-label") or ""
                    m = re.search(r"([0-9.]+)\s+star", label)
                    if m:
                        rating = m.group(1)
                    m = re.search(r"([0-9,]+)\s+[Rr]eview", label)
                    if m:
                        reviews = m.group(1).replace(",", "")
            except Exception:
                pass
            results.append({"name": name, "maps_link": href, "rating": rating, "reviews": reviews})
        except Exception:
            continue  # one broken card must not kill the batch
    return results

def fetch_place_details(page, maps_link):
    """Open one place page; pull address / phone / website. Every field is
    optional — many boutiques list no website or phone."""
    out = {"address": "", "phone": "", "website": ""}
    try:
        page.goto(maps_link, timeout=30000, wait_until="domcontentloaded")
        human_pause()
        try:
            el = page.locator(SEL_ADDRESS)
            if el.count() > 0:
                out["address"] = (el.first.get_attribute("aria-label") or "").replace("Address: ", "").strip()
        except Exception:
            pass
        try:
            el = page.locator(SEL_WEBSITE)
            if el.count() > 0:
                out["website"] = (el.first.get_attribute("href") or "").strip()
        except Exception:
            pass
        try:
            el = page.locator(SEL_PHONE)
            if el.count() > 0:
                out["phone"] = (el.first.get_attribute("aria-label") or "").replace("Phone: ", "").strip()
        except Exception:
            pass
    except Exception:
        pass  # place page failed to load — keep what we have (name + link)
    return out

def scrape_city(page, city, terms):
    """All search terms for one city. Returns (leads, per_term_counts)."""
    leads, per_term = [], {}
    for term in terms:
        query = f"{term} {city}"
        url = "https://www.google.com/maps/search/" + urllib.parse.quote(query)
        try:
            page.goto(url, timeout=45000, wait_until="domcontentloaded")
        except Exception:
            log(f"  !! search page failed for: {query}")
            per_term[term] = 0
            continue
        dismiss_consent(page)
        human_pause()
        cards = collect_result_links(page)
        per_term[term] = len(cards)
        log(f"  {term}: {len(cards)} results")
        for c in cards:
            details = fetch_place_details(page, c["maps_link"])
            leads.append({
                "city": city, "search_term": term,
                "name": c["name"], "rating": c["rating"], "reviews": c["reviews"],
                "maps_link": c["maps_link"], **details,
                "email": "", "instagram": "",
            })
    return leads, per_term

# ═══════════════════════════════════════════════════════════════════════════
# Enrichment — homepage + /contact of each business website
# ═══════════════════════════════════════════════════════════════════════════

def fetch_url(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (lead research)"})
    with urllib.request.urlopen(req, timeout=ENRICH_TIMEOUT) as r:
        return r.read(400_000).decode("utf-8", errors="replace")

def enrich(lead, failed_sites):
    site = (lead.get("website") or "").strip()
    if not site:
        return
    if not site.startswith("http"):
        site = "https://" + site
    emails, instas = set(), set()
    pages_tried = 0
    for path in ("", "/contact", "/contact-us", "/pages/contact"):
        try:
            html = fetch_url(site.rstrip("/") + path)
            pages_tried += 1
        except Exception:
            continue  # one path failing is normal; total failure logged below
        for m in EMAIL_RE.findall(html):
            if not EMAIL_JUNK.search(m):
                emails.add(m.lower())
        for m in INSTA_RE.findall(html):
            if m.lower() not in INSTA_JUNK:
                instas.add(m)
        if emails and instas:
            break  # got everything; be gentle with their server
    if pages_tried == 0:
        failed_sites.append({"name": lead["name"], "website": site, "city": lead["city"]})
        return
    lead["email"] = ", ".join(sorted(emails)[:3])
    lead["instagram"] = ", ".join("@" + h for h in sorted(instas)[:2])

# ═══════════════════════════════════════════════════════════════════════════
# Dedupe — same shop found by several search terms
# ═══════════════════════════════════════════════════════════════════════════

def dedupe(leads):
    seen, out = {}, []
    for lead in leads:
        key = (normalize_name(lead["name"]), normalize_phone(lead["phone"]))
        if key in seen:
            # keep the existing row but remember every term that found it
            prev = seen[key]
            terms = set(prev["search_term"].split(" | ")) | {lead["search_term"]}
            prev["search_term"] = " | ".join(sorted(terms))
            # fill blanks from the duplicate (a later term sometimes has more)
            for f in ("phone", "website", "email", "instagram", "address", "rating", "reviews"):
                if not prev.get(f) and lead.get(f):
                    prev[f] = lead[f]
            continue
        seen[key] = lead
        out.append(lead)
    return out

# ═══════════════════════════════════════════════════════════════════════════
# Excel output
# ═══════════════════════════════════════════════════════════════════════════

def write_excel(leads, failed_sites, per_city_term):
    import xlsxwriter
    wb = xlsxwriter.Workbook(OUTPUT_XLSX)
    head = wb.add_format({"bold": True, "bg_color": "#1a2340", "font_color": "white", "border": 1})
    hi = wb.add_format({"bg_color": "#d9f2e3"})
    lo = wb.add_format({"font_color": "#888888"})

    ws = wb.add_worksheet("Leads")
    cols = ["City", "Name", "Priority", "Phone", "Email", "Instagram", "Website",
            "Rating", "Reviews", "Address", "Found By", "Maps Link"]
    for c, title in enumerate(cols):
        ws.write(0, c, title, head)
    widths = [16, 32, 9, 16, 30, 20, 34, 7, 8, 44, 26, 18]
    for c, w in enumerate(widths):
        ws.set_column(c, c, w)
    row = 1
    for lead in sorted(leads, key=lambda x: ({"High": 0, "Medium": 1, "Low": 2}[priority_of(x)], x["city"])):
        pr = priority_of(lead)
        fmt = hi if pr == "High" else (lo if pr == "Low" else None)
        vals = [lead["city"], lead["name"], pr, lead["phone"], lead["email"],
                lead["instagram"], lead["website"], lead["rating"], lead["reviews"],
                lead["address"], lead["search_term"]]
        for c, v in enumerate(vals):
            ws.write(row, c, v, fmt)
        if lead["maps_link"]:
            # Maps URLs can be malformed or exceed Excel's 2079-char link cap —
            # the row must survive either way.
            try:
                ws.write_url(row, len(vals), lead["maps_link"], fmt, string="Open in Maps")
            except Exception:
                ws.write(row, len(vals), lead["maps_link"], fmt)
        row += 1
    ws.autofilter(0, 0, max(row - 1, 1), len(cols) - 1)
    ws.freeze_panes(1, 0)

    ws2 = wb.add_worksheet("Summary")
    ws2.write_row(0, 0, ["City", "Leads", "With Email", "With Website"], head)
    r = 1
    for city in sorted({l["city"] for l in leads}):
        rows = [l for l in leads if l["city"] == city]
        ws2.write_row(r, 0, [city, len(rows),
                             sum(1 for l in rows if l["email"]),
                             sum(1 for l in rows if l["website"])])
        r += 1
    r += 1
    ws2.write_row(r, 0, ["City", "Search Term", "Raw Results"], head)
    r += 1
    for city, terms in per_city_term.items():
        for term, n in terms.items():
            ws2.write_row(r, 0, [city, term, n])
            r += 1
    ws2.set_column(0, 2, 24)

    ws3 = wb.add_worksheet("Failed")
    ws3.write_row(0, 0, ["City", "Name", "Website (unreachable)"], head)
    for i, f in enumerate(failed_sites, start=1):
        ws3.write_row(i, 0, [f["city"], f["name"], f["website"]])
    ws3.set_column(0, 2, 34)

    wb.close()

# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser(description="Google Maps boutique lead finder")
    ap.add_argument("--cities", nargs="*", help="override target_cities, e.g. --cities 'Leicester UK'")
    ap.add_argument("--resume", action="store_true", help="continue from the checkpoint")
    args = ap.parse_args()

    cities = args.cities if args.cities else target_cities
    state = load_checkpoint() if args.resume else {"done_cities": [], "leads": [], "failed_sites": []}
    per_city_term = state.setdefault("per_city_term", {})
    todo = [c for c in cities if c not in state["done_cities"]]
    if args.resume and not todo:
        log("Checkpoint says every requested city is done — writing Excel from saved data.")
    log(f"Cities to process: {todo or '(none)'}")

    if todo:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            sys.exit("Playwright missing. Run: pip install playwright xlsxwriter && playwright install chromium")

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 900},
                                    locale="en-GB")
            for city in todo:
                log(f"\n=== {city} ===")
                city_leads, per_term = scrape_city(page, city, search_terms)
                per_city_term[city] = per_term

                # Enrich only this city's leads (with website) before checkpointing
                for lead in city_leads:
                    if lead["website"]:
                        enrich(lead, state["failed_sites"])

                state["leads"].extend(city_leads)
                state["done_cities"].append(city)
                save_checkpoint(state)
                with_email = sum(1 for l in city_leads if l["email"])
                log(f"{city}: {len(city_leads)} leads ({with_email} with email) — checkpoint saved")
            browser.close()

    final = dedupe(state["leads"])
    write_excel(final, state["failed_sites"], per_city_term)
    log(f"\nDone. {len(final)} unique leads → {OUTPUT_XLSX}")
    log(f"High priority: {sum(1 for l in final if priority_of(l) == 'High')}"
        f" · with email: {sum(1 for l in final if l['email'])}")

if __name__ == "__main__":
    main()

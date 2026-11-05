# Playbook UI review checklist: the definition of done

Use this when any Playbook UI change is ready to commit. Go through all of it, look at the real screenshots, and only then open the PR.

Precedence: the owner's words, then root `CLAUDE.md` and `src/playbook/CLAUDE.md`, then `src/playbook/DESIGN.md`, then the files in this folder.
This file is the gate. The rules behind each line are in `ux-process.md`, `layout-and-components.md`, `states-and-feedback.md`, `mobile.md`, `data-and-charts.md` and `copy-and-a11y.md`.

## 1. Order of work
1. Run `npm run build` (eslint, then tsc, then vite). It must pass. It is the same gate the deploy runs.
2. Take screenshots at 390×844, 360×740, 1024×768 and 1440×900 with the recipe in §3, and read every PNG yourself.
3. Tick every box in §2. Fix what fails and take the screenshots again.
4. Put "UI review" in the PR description: what you checked, what you fixed, and any risk you are unsure of (this is root `CLAUDE.md` "Pre-merge self-review").
5. After the Pages run succeeds, give the owner the smoke steps from §4.

## 2. Checklist
**A. The look matches V2 Bento glass (DESIGN.md §10 is the short version)**
- [ ] The backdrop has glows (§4), and every content block sits on a `PB.tile`. No tile is stacked on another tile.
- [ ] The view has at most one hero tile and one primary (gradient) button. The gradient appears nowhere else apart from the logo.
- [ ] Selected states (nav, segment, chip) use the frosted active recipe (DESIGN.md §5). Never a solid fill.
- [ ] Desktop uses the 12-column bento and every row of a fixed layout is full (a paged results grid may end on a partial row). It drops to 6 columns at 1099px and below. At 768px and below the phone layout is one column, with stat tiles 2 per row.
- [ ] Radii only from DESIGN.md §5's radius table.
- [ ] Spacing uses the scale in `layout-and-components.md` §1. Tiles with the same job share padding, baselines and the position of the status dot.
- [ ] Type follows DESIGN.md §3. Counts and ₹ are in `JetBrains Mono` with `tabular-nums`. No Sora on numbers.
- [ ] Clickables carry `pb-pill` / `pb-tile` (DESIGN.md §8).

**B. UX flow (`ux-process.md`)**
- [ ] You can name the screen's single job and its one primary action. If you cannot, the screen does two jobs: split it.
- [ ] The common task takes the fewest taps you can manage. Defaults are filled in (last website, vendor, category).
- [ ] The container is right: a sheet for short tasks of 6 fields or fewer, a full page for long forms. Never a sheet on top of a sheet.
- [ ] Reversible actions use Undo. Anything external or irreversible (Shopify, money) goes through `useConfirm` and names the item and what happens.
- [ ] Coming back from detail keeps the page number, filters and scroll position.
- [ ] Automation shows what it will do before anything goes live, and what it did afterwards.

**C. States (`states-and-feedback.md` §14 lists them per component)**
- [ ] Loading shows skeletons shaped like the real layout, never a bare "Loading…".
- [ ] Load failure shows an error in the tile, with Retry. Not just a toast. (Today only `pages/ProductPage.tsx` does this.)
- [ ] There are two empty states, first run and filtered, both with the shared `<Empty>`. The filtered one has "Clear filters".
- [ ] Partial failure lists which items failed and why.
- [ ] Every async button gives two signals: a "Saving…" label plus disabled (`pointerEvents: 'none'`, opacity 0.5), then a toast through `friendlyError` (root `CLAUDE.md` "Buttons").
- [ ] Statuses that the server changes (reading, generating, publishing) refresh on their own. Copy never says "reload" unless there is a button for it.

**D. Mobile (`mobile.md`)**
- [ ] Nothing scrolls sideways at 390px or at 360px.
- [ ] Every tap target is at least 44×44. Phone inputs are 16px with height 48.
- [ ] Frequent actions sit in the bottom thumb zone. Destructive actions are at least 16px from the primary button.
- [ ] The last row clears the glass tab bar, and safe areas are respected. Do not use `page-pad`, `--nav-h` or the FAB, which are DailyWork only.
- [ ] Sheets: `createPortal`, `modal-inner`, scroll lock, `useBackClose`, every field reset on close, one primary in the footer and no destructive action there, and the footer stays visible with the keyboard open.
- [ ] Hover-only effects are wrapped in `@media (hover: hover)`. Every swipe action also exists as a visible button.

**E. Accessibility (`copy-and-a11y.md` §B)**
- [ ] Text a person must read uses `PB.tx` or `PB.tx2`. `PB.tx3` is only for chevrons, icons, placeholders and timestamps.
- [ ] Every status is a dot plus a label. The dot is `aria-hidden`.
- [ ] `:focus-visible` shows `PB.focus` as an outline with a 2px offset. There is no `outline: none` without it.
- [ ] Clickable tiles are `<button>` or `<a>`, never a div with onClick. Icon-only buttons have an `aria-label`.
- [ ] Sheets have `role="dialog"`, `aria-modal`, a focus trap, and return focus on close. Toasts use `aria-live`.
- [ ] Reduced motion turns off movement, and reduced transparency gets opaque fills.

**F. Performance**
- [ ] At most 3 backdrop-filter surfaces at once on phone (tab bar, sheet, scrim) and 6 on desktop (DESIGN.md §5). Phone tiles, list rows, results-grid cards and the hero are never blurred.
- [ ] Glows are one fixed radial-gradient layer at every size, not `filter: blur()` divs, over a root with `isolation: isolate`.
- [ ] Photos are sized thumbnails with `loading="lazy"`, width and height set, and `object-fit: cover`.
- [ ] Lists paginate (25 a page). There is no `select('*')` on tables that grow (root `CLAUDE.md` "Database sustainability").
- [ ] On phone, only `transform` and `opacity` animate. Desktop hover (inside `@media (hover:hover)`) may also ease `box-shadow`, `border-color` and `filter`, as in DESIGN.md §8.

**G. Copy (`copy-and-a11y.md` §A)**
- [ ] Words staff use: Websites, Products, saree, lehenga. Buttons say exactly what happens ("Publish to 3 websites"), and the toast repeats it.
- [ ] Errors say what went wrong and what to do next. Never show raw `error.message`.
- [ ] ₹ uses Indian grouping (₹1,23,456). Times are in IST.
- [ ] No lorem ipsum, TODO or dummy text. Placeholders only as examples ("e.g. Banarasi silk saree"), never as the label. No emoji icons or marketing lines. A disabled button says why it is disabled.

**H. Code hygiene**
- [ ] Colours and recipes come from `src/playbook/pbTheme.ts` (`PB.*`). If that file does not exist yet, create it first (`layout-and-components.md` §0). Redesigned screens have no new `T.*` accents.
- [ ] No hex, no `rgba()` literals, no hex alpha suffix. Use tokens or `alpha()`.
- [ ] Each new file is under 200 lines. Grandfathered files do not grow (root `CLAUDE.md` "Reading conventions").
- [ ] Reuse before building: `src/components/ui/` (`Empty`, `ConfirmModal`/`useConfirm`, `Toggle`, `ActionSheet`, `Skeleton`, `PrintPreview`), Playbook's `PbModal`, `usePbToasts`, `status.tsx`, `website/ui.tsx`, `Pager`.
- [ ] Imports respect the division boundary. No DailyWork feature folders. The shared layer is touched only if needed, and the PR says so.
- [ ] Number inputs block letters (`numKey` in `status.tsx`). No `window.alert`, `confirm` or `open`. HTML templates use `escHtml`.

Quick literal and size scan over the files you changed:
```bash
F=$( { git diff --name-only origin/main -- src/playbook; git ls-files --others --exclude-standard src/playbook; } | grep -E '\.tsx?$' | sort -u)
[ -n "$F" ] && { grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(|\+ *'[0-9A-Fa-f]{2}'|window\.(alert|confirm|open)" $F; wc -l $F; }
```

## 3. Verification recipe: look at the screen
**Why a harness.** The real app needs login: `src/App.tsx` shows `Login` until there is a signed-in user, and the data is live Supabase. You do not have staff credentials, so never guess them or ask for them in a script. Render the component with mock props instead.

**3.1 Harness.** Put it in `harness-pb/`. It is already git-excluded through `harness-*/` in `.git/info/exclude`, the same way as `harness-me/` and `harness-ob/`. Never commit it.
- `harness-pb/index.html`: copy `harness-ob/index.html` (it has the viewport meta with `viewport-fit=cover`, `#root` and `./main.tsx`).
- `harness-pb/main.tsx`: import `'../src/index.css'`. Render the component inside the Playbook backdrop, so glass sits over glows. Pick the state from `?state=`:
```tsx
const state = new URLSearchParams(location.search).get('state') ?? 'filled';
const rows = { filled: MOCK, empty: [], long: LONG_MOCK }[state] ?? MOCK;
// Mock with a long name, Hindi text, big ₹ values and every status value.
// Render loading/error by passing the props or flags that screen uses.
```
- These render from props alone: `ProductCard`, `Pager`, `ProductFilters`, `Dot`, `PbModal`, `PbToasts`, `WebsiteCard`, everything in `website/ui.tsx`, the Publishing, Pricing, Tags and Content sections, `AddProductModal`, `PhotoPicker`, `VendorSelect`, `ProductFacts`, `ListingEditor`, `Guide`.
- Pages that fetch on mount (Dashboard, Products, ProductPage, Websites, Vendors, PbSettings, RoutingSection) need the network mocked. Better: split them so the view takes data as props, and shoot the view. Mocking through `page.route` on `**/rest/v1/**` plus a fake session is untested. If you rely on it, say so in the PR.

**3.2 Serve it.** Run `npx vite harness-pb --port 5199` as a background command, and wait until it prints "Local:".

**3.3 Shoot and audit.** Save this as `harness-pb/shoot.cjs` and run `node harness-pb/shoot.cjs`. `require('playwright')` and a bare `chromium.launch()` work here because `NODE_PATH` and `PLAYWRIGHT_BROWSERS_PATH` are already set. Use a `.cjs` file: an ES module import does not read `NODE_PATH`.
```js
const { chromium } = require('playwright');
const OUT = process.env.OUT || 'harness-pb'; // git-excluded; pass your scratchpad dir in OUT
const sizes = [['phone', { width: 390, height: 844 }, true], ['small', { width: 360, height: 740 }, true],
  ['tab', { width: 1024, height: 768 }, false], ['desk', { width: 1440, height: 900 }, false]];
(async () => {
  const b = await chromium.launch();
  for (const state of ['filled', 'empty', 'long']) for (const [n, viewport, phone] of sizes) {
    const ctx = await b.newContext({ viewport, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
    const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
    await p.goto(`http://localhost:5199/?state=${state}`); await p.waitForTimeout(800);
    // Playbook scrolls inside .pb-scroll: unroll it so fullPage captures everything.
    await p.addStyleTag({ content: '.pb-scroll{height:auto!important;overflow:visible!important}' });
    await p.screenshot({ path: `${OUT}/pb-${state}-${n}.png`, fullPage: true });
    console.log(state, n, JSON.stringify(await p.evaluate((phone) => {
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const lab = e => (e.getAttribute('aria-label') || e.innerText || e.tagName).trim().slice(0, 30);
      const all = [...document.querySelectorAll('body *')].filter(vis);
      const hits = all.filter(e => e.matches('a,button,input,select,textarea,[role=button],[role=tab],[role=radio],[tabindex]:not([tabindex="-1"])'));
      return {
        sideScroll: [document.documentElement, ...document.querySelectorAll('.pb-scroll')].some(e => e.scrollWidth > e.clientWidth + 1),
        offRight: all.filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(lab).slice(0, 8),
        under44: hits.map(e => [lab(e), ...[e.getBoundingClientRect()].map(r => `${r.width | 0}x${r.height | 0}`)])
          .filter(([, s]) => s.split('x').some(v => +v < 44)),
        clipped: all.filter(e => /hidden|clip/.test(getComputedStyle(e).overflow) && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)).map(lab).slice(0, 8),
        tinyText: all.filter(e => [...e.childNodes].some(c => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 11).map(lab).slice(0, 8),
        inputsUnder16: phone ? [...document.querySelectorAll('input,select,textarea')].filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(lab) : [],
      };
    }, phone)));
    await ctx.close();
  }
  await b.close();
})();
```
Then read every PNG with the Read tool. `deviceScaleFactor: 1` keeps the images small enough to read. Use 2 only for an image you will show the owner.

**3.4 Reading the results.**
- `sideScroll` must be false, and `offRight` must be empty.
- `under44`: fix every entry on phone. A text link inside a sentence is the only exception. On desktop, 24px or more is acceptable.
- `clipped`: fix any entry that is not an intended 2-line clamp on a list name.
- `tinyText` and `inputsUnder16` must be empty.
- Any `PAGEERR` blocks the change.

**3.5 What to look for in the PNG**
- Grid: the tiles line up on the 12 or 6 columns, rows are full, and the gaps are equal.
- Hierarchy: one thing pulls the eye first. Only one gradient. Status dots sit in the same place on every tile.
- Text: nothing clipped or overlapping. Long names wrap or clamp. The mono numbers line up.
- Contrast: no grey text you have to squint at, especially over the amber glow and inside selected pills. Check against the measurements in `copy-and-a11y.md` §B1.
- Phone: the last row clears the tab bar, and the primary action sits in the bottom third.
- Empty and long states look designed, not broken.

**3.6 Extra passes when the change touches them**
- Keyboard: `await p.keyboard.press('Tab')` a few times, then screenshot. The focus ring must be visible.
- Reduced motion: `await p.emulateMedia({ reducedMotion: 'reduce' })`.
- Other sizes, landscape and CPU throttling: `mobile.md` §13.
- Charts: `data-and-charts.md` §13.

## 4. Smoke steps for the owner
Write these in plain words in your final message, after the Pages run is green (root `CLAUDE.md` "Post-deploy smoke test"). Give 2–4 steps on the phone they actually use, then what "broken" looks like.
> 1. Open DailyOffice, switch to Playbook, tap **Products**.
> 2. Tap any saree. The photo, price and websites show on one screen with no sideways scrolling.
> 3. Tap **Save facts**. The button says "Saving…", then a green "Saved" message appears.
> Broken looks like: the page jumps sideways, a button does nothing, or text runs off the edge.

Ask for a real iPhone and a mid-range Android check when the change touches sheets, the keyboard or the glass layers.

## 5. The 12 most common UI/UX mistakes: catch them yourself
1. The gradient used on more than one button, or two primary actions in one view.
2. Ragged bento rows, or a dashboard whose tiles are all the same size with no hero.
3. Glass on a flat background with no glows, or tiles stacked on tiles.
4. Literals: hex, `rgba()`, a hex alpha suffix, or old `T.ac*` indigo on a redesigned screen.
5. Must-read text in `PB.tx3`, or `PB.tx2` inside a selected pill over the amber glow.
6. Status shown by colour alone, without a label.
7. Numbers in a proportional font, or ₹ in Western grouping (1,234,567).
8. "Loading…" text or a spinner instead of skeletons. A failed load that falls through to "No products yet".
9. Tap targets under 44px, inputs under 16px on phone, or sideways scroll at 390px.
10. An async button with no "Saving…" label, no disabled state, or no toast through `friendlyError`.
11. A sheet that does not reset on close, does not close on device Back, or hides Save behind the keyboard.
12. Hover-only or swipe-only actions with no visible button on touch, and motion that ignores reduced motion.

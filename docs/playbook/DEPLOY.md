# How Playbook goes live

Two halves, deployed in different ways. A change is live only when its half
has been deployed.

## 1. The app (what staff see)
`.github/workflows/deploy.yml` builds and publishes it to GitHub Pages on
every merge to `main` (1 to 4 minutes). Before the build it runs
`npm run check:server` and `npm run test:server` (below): if either fails,
nothing is published.

## 2. The server (three Supabase edge functions)
`pb-products` (reader, writer, publish, stock, bulk actions, the worker),
`pb-telegram` (webhook, grouping, crawler API) and `pb-photo-prints` (photo
fingerprints). Supabase project `ulphprdnswznfztawbvg`. All three are
deployed with `verify_jwt: false`; each checks its callers itself
(`pb-products/auth.ts`).

**A merge does not deploy them.** Each function is deployed by hand as a
one-line *loader*:

```ts
// Loader pinned to main @ <short sha> (<what changed>)
import 'https://raw.githubusercontent.com/kreeva-lifestyle/unsort/<full merge sha>/supabase/functions/pb-products/index.ts';
```

The function then loads `index.ts`, and every file it imports, from this
repository at exactly that commit. The loader text is stored only in
Supabase, not here.

### Deploying after a server change
1. Merge to `main` and note the merge commit's full SHA.
2. Deploy the loader for each function whose behaviour must change, pinned
   to that SHA (Supabase MCP `deploy_edge_function`, or paste it in the
   Supabase dashboard's function editor), `verify_jwt` off.
3. Check it loads: `POST /functions/v1/<function>` with body
   `{"action":"work"}` and no credentials must answer **401** with a JSON
   sentence ("Sign in to DailyOffice again…"). A 500 or a timeout means the
   function could not load (usually a missing import).

Which functions: `pb-telegram` and `pb-photo-prints` import `auth.ts`,
`db.ts`, `http.ts` and `types.ts` from `pb-products`. Each function runs a
complete snapshot of its pinned commit, so a change to those shared files
does not *break* a function that was not redeployed; redeploy it only when
the change has to take effect there too.

### Rolling back
Deploy the loader again, pinned to the earlier commit. Database migrations
are not rolled back by this; they are additive by rule.

### What this depends on (the risk, D11 of the 2026-11-13 launch research)
- **GitHub must be reachable when a function starts.** If
  `raw.githubusercontent.com` cannot be reached at a cold start, the function
  cannot load until it can.
- **The repository must stay public.** A private repository's raw files need
  a token, so the functions would stop loading. Do not make it private
  before changing how the server is deployed.
- **No automatic deploy.** A merged server fix is not live until step 2.

The way out, when the owner wants it: deploy the functions' real files from
GitHub Actions with the Supabase CLI. That needs a Supabase access token
saved as a repository secret, which only the owner can create. Until then
the loader stays, and the checks below are the gate.

## The automatic checks on server code
- `npm run check:server` — TypeScript over the three functions
  (`supabase/functions/_check/`). A missing import in an edge function is a
  runtime 500, and `npm run build` does not look at that folder.
- `npm run test:server` — the unit tests beside the functions
  (`node --test`, Node 22 or newer).

Both run in the deploy workflow on every merge, and should be run by hand
before merging a server change. They test the pure parts. Nothing here has
run against a real Shopify store or a real Telegram group: the first of each
is checked by hand (see the hand checks in the launch research report).

## What is deployed
The repository cannot say: the pin lives in Supabase. To see what is live,
read the function's source in the Supabase dashboard (or
`get_edge_function`): the loader line names the commit.

As found on 2026-11-13: `pb-products` is redeployed with every server change
(pinned to that change's merge commit); `pb-telegram` is version 3, pinned to
`758ccd607b128b4d806bd74d9563fab8b4323d0a`; `pb-photo-prints` is version 5,
pinned to `10a3ef2cf1197e9ce0fcfe03e47186fc1ed517bb`. Neither of those two
folders had changed since its pin on that day.

# Type-check for the Playbook edge functions

`npm run build` does not look at `supabase/functions/`. This folder lets the
same TypeScript check them without Deno installed:

- `npm run check:server` — `tsc --noEmit` over `pb-products`, `pb-telegram`
  and `pb-photo-prints` (their `index.ts` and everything they import), with
  two small stand-ins: `deno-stub.d.ts` (the `Deno.env` and `Deno.serve` the
  functions use) and `esm-stub.d.ts` (the one module loaded from a URL).
- `npm run test:server` — the unit tests beside the functions
  (`node --test`, Node 22 or newer).

Both run in `.github/workflows/deploy.yml` before the build, so a change
that breaks either does not deploy. A missing import in an edge function is a
runtime 500, which is why this exists.

The folder name starts with `_`, so Supabase does not treat it as a function.

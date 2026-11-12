// Shared bits of the Playbook dashboard: the loaded data shape and the en-IN
// count formatter. Website-tile spans live in src/playbook/layout.ts.
import type { PbProductStatus } from '../../types';
import type { WebsiteLite } from '../../data/products';
import type { PbPage } from '../PbNav';
import type { ProductsStart } from '../../pages/Products';

export type DashData = {
  products: Record<PbProductStatus, number>;
  sites: WebsiteLite[];
  perSite: Record<string, Record<string, number>>;
  failed: number;
  review: number;
  paused: boolean;
  /** What the AI cost since the 1st of this month (IST); null when the figure could not be read. */
  ai: { usd: number; products: number; writes: number } | null;
  /** Published listings that carry a note · when the oldest listing awaiting approval was written. */
  noted: number; oldestReview: string | null;
  /** When the worker last ran (null = not recorded yet) · the day's AI limit in ₹ (0 = none) · ₹ of AI today (null = could not be read). */
  lastRun: string | null; limit: number; spentToday: number | null;
};

export type DashGo = (p: PbPage, s?: ProductsStart) => void;

const int = new Intl.NumberFormat('en-IN');
/** Counts in Indian grouping (1,00,000). */
export const count = (n: number) => int.format(n);

/** Sum one listing group ("working", "published", …) over every website. */
export const groupTotal = (d: DashData, group: string) =>
  Object.values(d.perSite).reduce((s, g) => s + (g[group] ?? 0), 0);

/** What the automation should be working on right now: products to read, and listings in progress on websites that are switched on. */
export const waitingWork = (d: DashData) =>
  d.products.new + d.products.reading + d.sites.filter(s => s.active).reduce((n, s) => n + (d.perSite[s.id]?.working ?? 0), 0);

/** Minutes without a run, with work waiting, after which the dashboard says the automation looks stalled. */
export const STALL_MIN = 10;
/** Work is waiting, automation is on, and the worker has not run for STALL_MIN minutes (or its last run was never recorded… then nothing is said). */
export const stalled = (d: DashData, now = Date.now()) =>
  !d.paused && !!d.lastRun && waitingWork(d) > 0 && now - Date.parse(d.lastRun) > STALL_MIN * 60_000;


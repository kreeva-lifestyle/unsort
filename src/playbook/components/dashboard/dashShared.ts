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
};

export type DashGo = (p: PbPage, s?: ProductsStart) => void;

const int = new Intl.NumberFormat('en-IN');
/** Counts in Indian grouping (1,00,000). */
export const count = (n: number) => int.format(n);

/** Sum one listing group ("working", "published", …) over every website. */
export const groupTotal = (d: DashData, group: string) =>
  Object.values(d.perSite).reduce((s, g) => s + (g[group] ?? 0), 0);

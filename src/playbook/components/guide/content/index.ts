// The whole Product Directory guide, in order. Shown in the app (pages/Guide.tsx)
// and printed to HTML + PDF by scripts/playbook-guide-pdf.cjs.
import type { GuideSection } from '../types';
import { INTRO } from './intro';
import { CONNECT } from './connect';
import { RULES } from './rules';
import { WRITING } from './writing';
import { TELEGRAM } from './telegram';
import { IMPORT_WEB } from './importWeb';
import { TAGS } from './tags';
import { DAILY } from './daily';
import { HELP } from './help';

export const GUIDE_META = {
  title: 'Product Directory — User Guide',
  brand: 'DailyOffice · Playbook',
  subtitle: 'Vendor products → the right Shopify websites, priced, written and published automatically.',
  updated: 'November 2026',
  pdf: '/playbook/product-directory-guide.pdf',
};

export const GUIDE_SECTIONS: GuideSection[] = [...INTRO, ...CONNECT, ...RULES, ...WRITING, ...TELEGRAM, ...IMPORT_WEB, ...TAGS, ...DAILY, ...HELP];

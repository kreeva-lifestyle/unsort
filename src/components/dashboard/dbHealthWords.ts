// The words on the Dashboard's "Database & server" tile. The database hands
// back its own names (brand_tags, sku-thumbs, a line of SQL); everything here
// turns those into what the owner calls the same thing in the app (owner,
// 2026-11-10: "Fix wordings"). An unknown name still reads as words, never as
// code.

/** brand_tags → "Brand tags", sku-thumbs → "Sku thumbs". */
const words = (name: string): string => {
  const s = name.replace(/^pb[_-]/, 'playbook ').replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const TABLES: Record<string, string> = {
  brand_tags: 'Brand Tags labels',
  product_catalog: 'SKU list',
  master_sheet_rows: 'Master sheet copy',
  master_sheet_columns: 'Master sheet columns',
  packtime_scans: 'PackTime scans',
  packtime_sheet_queue: 'PackTime scans waiting for the sheet',
  packcam_clips: 'Pack Cam clips',
  client_finder_hits: 'Client Finder results',
  buyer_queue: 'Buyer search queue',
  buyer_leads: 'Buyer leads',
  buyer_runs: 'Buyer searches',
  audit_log: 'Change history',
  activity_logs: 'Activity log',
  error_logs: 'Error log',
  attendance_entries: 'Attendance entries',
  cash_challans: 'Cash challans',
  cash_challan_items: 'Cash challan items',
  cash_challan_payments: 'Cash challan payments',
  inventory_items: 'Inventory items',
  item_components: 'Inventory components',
  purchase_orders: 'Purchase orders',
  purchase_order_items: 'Purchase order items',
  link_clicks: 'Trackly link clicks',
  notifications: 'Notifications',
  pb_products: 'Playbook products',
  pb_product_images: 'Playbook product photos',
  pb_activity: 'Playbook activity',
};
export const tableName = (name: string): string => TABLES[name] || words(name);

const FOLDERS: Record<string, string> = {
  'playbook-products': 'Playbook product photos',
  'costing-images': 'Costing photos',
  'sku-thumbs': 'SKU thumbnails',
  'tailor-sheets': 'Tailor sheets',
  'tailor-diagrams': 'Tailor diagrams',
  'listing-templates': 'Listing templates',
  'employee-qr': 'Employee QR codes',
  'payment-qr': 'Payment QR codes',
  'flow-files': 'Flow files',
  'issue-reports': 'Problem report photos',
  'program-voice-notes': 'Program voice notes',
};
export const folderName = (name: string): string => FOLDERS[name] || words(name);

// Jobs the server runs by itself. Two names for one job share a label on
// purpose: the tile adds lines with the same words together.
const JOBS: Record<string, string> = {
  refresh_product_catalog: 'Rebuilding the SKU list',
  refresh_product_catalog_includes: 'Rebuilding the SKU list',
  refresh_catalog_now: 'Rebuilding the SKU list',
  trigger_master_sync: 'Checking the master sheet',
  dispatch_master_push: 'Checking the master sheet',
  trigger_packtime_sheet_sync: 'Sending PackTime scans to the sheet',
  trigger_pb_worker: 'Playbook reading products',
  trigger_pb_telegram_assemble: 'Playbook Telegram intake',
};

const LIVE = 'Live updates (screens that refresh by themselves)';

/** One database statement → the kind of work it is, in the owner's words. */
export const workLabel = (q: string): string => {
  if (/^select wal->>|pg_publication_tables|realtime\./i.test(q)) return LIVE;
  // The API layer re-reading the database's own catalogue (time zones, types).
  if (/pg_timezone_names|base_types|pg_catalog\.|information_schema\./i.test(q)) return 'Supabase housekeeping';
  const job = q.match(/^\s*select\s+(?:public|private)\.([a-z_]+)\s*\(/i);
  if (job) return JOBS[job[1]] || `Background job: ${words(job[1]).toLowerCase()}`;
  if (/^with pgrst_source/i.test(q)) {
    const t = q.match(/(?:from|into|update)\s+"?public"?\."?([a-z_]+)"?/i);
    if (t) return `${/^with pgrst_source as \(\s*(insert|update|delete)/i.test(q) ? 'Saving' : 'Loading'} ${tableName(t[1])}`;
  }
  return 'Other database work';
};

/** 8 GB, 0.94 GB, 161 MB, 12 KB — no trailing zeros. */
export const sizeText = (b: number): string =>
  b >= 1024 ** 3 ? `${+(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/** "+12 MB", "−3 MB", or "no change". */
export const growthText = (b: number): string => (Math.abs(b) < 1024 ? 'no change' : b > 0 ? `+${sizeText(b)}` : `−${sizeText(-b)}`);

/** "4.5 min a day", "12 sec a day". */
export const perDayText = (s: number): string =>
  s >= 60 ? `${+(s / 60).toFixed(s >= 600 ? 0 : 1)} min a day` : s >= 1 ? `${Math.round(s)} sec a day` : 'under 1 sec a day';

/** "just now", "23 min ago", "1 hour ago", "3 hours ago". */
export const agoText = (iso: string): string => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? '' : 's'} ago`;
};

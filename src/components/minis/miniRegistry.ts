// The Minis registry: every tool's view id, breadcrumb label and home tile.
// Split out of Minis.tsx (grandfathered over the size limit) so adding a
// tool no longer grows that file. Array order is the on-screen order.
// Ids are internal keys (saved dashboard shortcuts use them): 'ratecard' is
// Vendor Studio, kept so pinned shortcuts keep working after the rename.
export type MiniView = 'home' | 'utsav' | 'cbazaar' | 'odette' | 'indya' | 'address' | 'trackly' | 'return_labels' | 'ratecard' | 'dropbox_links' | 'forward_dropbox' | 'master_assistant' | 'client_finder' | 'dropbox_upload' | 'costing' | 'otp' | 'pricing' | 'jobwork';

/** Breadcrumb text per view; null hides the crumb. Record<> so a new view
 *  without a label is a compile error. */
export const MINI_LABELS: Record<MiniView, string | null> = {
  home: null, cbazaar: 'Cbazaar Import', odette: 'Odette Import', indya: 'Indya Import', address: 'LabelMaker', utsav: 'Utsav Import',
  trackly: 'Trackly', return_labels: 'Product QC Labels', ratecard: 'Vendor Studio', dropbox_links: 'Dropbox Link Generator',
  forward_dropbox: 'Forward → Dropbox', master_assistant: 'Master Assistant', client_finder: 'Client Finder',
  dropbox_upload: 'Dropbox Uploader', costing: 'Product Costing', otp: 'OTP Inbox', pricing: 'Price Projector', jobwork: 'Jobwork',
};

export const MINI_TILES: { id: MiniView; title: string; desc: string }[] = [
  { id: 'utsav', title: 'Utsav Import', desc: 'Import vendor Excel, generate ARYA SKU column, export as XLS' },
  { id: 'cbazaar', title: 'Cbazaar Import', desc: 'Import Cbazaar vendor Excel, generate ARYA SKU column, export as CSV' },
  { id: 'odette', title: 'Odette Import', desc: 'Aggregate SKU quantities across multiple vendor sheets' },
  { id: 'indya', title: 'Indya Import', desc: 'Fill Indya’s product master with stock from your vendor sheets — same flow as Odette, the file goes back exactly as it came' },
  { id: 'address', title: 'LabelMaker', desc: 'Save addresses, print 4x6 inch courier label stickers' },
  { id: 'trackly', title: 'Trackly', desc: 'Shorten URLs and track clicks — device, browser, location, timing analytics' },
  { id: 'return_labels', title: 'Product QC Labels', desc: 'Print QC assured & return stickers — same size as brand tag labels' },
  { id: 'ratecard', title: 'Vendor Studio', desc: 'Everything for vendors in one place — rate cards (Excel, manual or from master), catalog downloads, catalog maker and product details, shared as images' },
  { id: 'dropbox_links', title: 'Dropbox Link Generator', desc: 'SKU → view-only Dropbox links — whole folder or every image, single or bulk from Excel' },
  { id: 'forward_dropbox', title: 'Forward → Dropbox', desc: 'Snap a document, name it by date, send it to Dropbox — phone only' },
  { id: 'master_assistant', title: 'Master Assistant', desc: 'Ask about the master sheet — attach a seller sheet to compare live/not-live and what they never uploaded' },
  { id: 'client_finder', title: 'Client Finder', desc: 'Upload a product photo or pick a SKU → the websites that have posted that image, exported to Excel' },
  { id: 'dropbox_upload', title: 'Dropbox Uploader', desc: 'Send any file to Dropbox — pick the folder each time, watch the progress, get told if it fails' },
  { id: 'costing', title: 'Product Costing', desc: 'Cost a product from its components and suppliers — photo, material codes, and a purchase plan PDF for any quantity' },
  { id: 'jobwork', title: 'Jobwork', desc: 'Work given outside — material out, pieces back in parts, what is still with each jobworker, bill and payments, and a statement to share' },
  { id: 'pricing', title: 'Price Projector', desc: 'Project a selling price from fabric, material, stitching, maintenance and profit — thresholds per category and cost-cutting suggestions' },
  { id: 'otp', title: 'OTP Inbox', desc: 'OTPs from the owner’s phone, live — staff tap to copy, codes expire in minutes' },
];

export const en = {
  // Page
  title: 'Programs',
  addProgram: '+ Add Program',
  searchPlaceholder: 'Search programs...',
  noResults: 'No programs found.',
  noResultsHint: 'Try adjusting your search or add a new program.',
  loading: 'Loading...',
  records: 'records',

  // Table headers
  programUid: 'Program ID',
  sellingSku: 'Selling SKU',
  manufacturingSku: 'Manufacturing SKU',
  matching: 'Matching',
  companies: 'Companies',
  createdBy: 'Created By',
  updatedAt: 'Updated',
  actions: 'Actions',

  // Form
  addTitle: 'Add Program',
  editTitle: 'Edit Program',
  sellingSkuLabel: 'Selling SKU',
  manufacturingSkuLabel: 'Manufacturing SKU',
  matchingLabel: 'Matching',
  linkLabel: 'Dropbox / Google Drive Link',
  linkPlaceholder: 'Paste image link...',
  voiceNote: 'Voice Note',
  save: 'Save',
  cancel: 'Cancel',
  skuRequired: 'At least one of Selling SKU or Manufacturing SKU is required.',
  saving: 'Saving...',
  saved: 'Program saved!',
  saveFailed: 'Save failed',
  conflictError: 'Record was modified by another user. Please refresh.',

  // Matchings
  companiesForMatching: 'Companies for this Matching',
  companyName: 'Company Name',
  addCompany: '+ Add Company',
  matchingLabelField: 'Matching Label',

  // Price
  priceBreakdown: 'Price Breakdown',
  partName: 'Part Name',
  jobStitch: 'Job Stitch',
  stitchRate: 'Stitch Rate',
  oneMP: '1 M/P',
  meterPerPcs: 'Meter/PCS',
  rate: 'Rate',
  total: 'Total',
  fabricMeter: 'Fabric Meter',
  addPart: '+ Add Part',
  grandTotal: 'Grand Total',
  savePrices: 'Save Prices',
  pricesSaved: 'Prices saved!',

  // History
  history: 'History',
  noHistory: 'No changes recorded yet.',
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  priceUpdate: 'Price updated',
  voiceUpload: 'Voice note uploaded',

  // Actions
  view: 'View',
  edit: 'Edit',
  qr: 'QR',
  pdf: 'PDF',
  deleteAction: 'Delete',
  deleteConfirm: 'Delete this program?',
  deleted: 'Program deleted.',
  shareLink: 'Share Link',
  copyLink: 'Copy Link',
  copied: 'Link copied!',

  // Voice
  record: 'Record',
  stop: 'Stop',
  play: 'Play',
  reRecord: 'Re-record',
  upload: 'Upload',
  recording: 'Recording...',
  noVoiceNote: 'No voice note attached.',

  // Language
  language: 'Language',
} as const;

export type TranslationKey = keyof typeof en;

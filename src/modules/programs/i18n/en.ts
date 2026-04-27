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
  fabricMeterCol: 'Fabric Meter',
  workTotalCol: 'Work Total',
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

  // Brands (matching section)
  brands: 'Brands',
  brandsLabel: 'Brands',
  brandName: 'Brand Name',
  brandLabel: 'Brand',
  addBrand: '+ Add Brand',
  companiesForMatching: 'Companies for this Matching',
  companyName: 'Company Name',
  addCompany: '+ Add Brand',
  matchingLabelField: 'Matching Label',

  // Form sections
  programInfo: 'Program Info',
  workProgram: 'Work Program',
  fabricProgram: 'Fabric Program',
  matchingProgram: 'Matching Program',

  // Price
  priceBreakdown: 'Price Breakdown',
  partName: 'Part Name',
  jobStitch: 'Job Stitch',
  stitch: 'Stitch',
  oneRs: '1 RS',
  stitchRate: 'Stitch Rate',
  oneMP: '1 M/P',
  meterPerPcs: 'MTR/PCS',
  rate: 'Rate',
  total: 'Total',
  fabricName: 'Fabric Name',
  fabricMeter: 'Fabric Meter',
  addPart: '+ Add Part',
  grandTotal: 'Grand Total',
  grandFabricTotal: 'Grand Fabric Total',
  grandWorkTotal: 'Grand Work Total',
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
  back: 'Back',
  openOriginal: 'Open original',
  downloadPng: 'Download PNG',
  prev: '← Prev',
  next: 'Next →',
  restored: 'Program restored',
  remove: 'Remove',
  removeVoiceConfirm: 'Remove this voice note?',
  voiceRemoved: 'Voice note removed',

  // Voice
  record: 'Record',
  stop: 'Stop',
  play: 'Play',
  reRecord: 'Re-record',
  upload: 'Upload',
  recording: 'Recording...',
  noVoiceNote: 'No voice note attached.',
  voiceHint: 'Max 1 minute (auto-stops) · Max 10MB file size',
  voiceTooLarge: 'Voice note too large (max 10MB)',
  invalidAudio: 'Invalid audio file',
  uploadFailed: 'Upload failed',

  // Empty state
  noPrograms: 'No programs yet',
  noProgramsHint: 'Create your first program to get started.',

  // Language
  language: 'Language',
} as const;

export type TranslationKey = keyof typeof en;

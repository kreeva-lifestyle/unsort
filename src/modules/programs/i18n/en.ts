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
  updatedAt: 'Updated',
  actions: 'Actions',

  // Form
  addTitle: 'Add Program',
  editTitle: 'Edit Program',
  sellingSkuLabel: 'Selling SKU',
  manufacturingSkuLabel: 'Manufacturing SKU',
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
  skuPlaceholderSell: 'e.g. SKU-SELL-001',
  skuPlaceholderMfg: 'e.g. SKU-MFG-001',

  // Brands
  brands: 'Brands',
  brandsLabel: 'Brands',
  brandName: 'Brand Name',
  brandLabel: 'Brand',
  addCompany: '+ Add Brand',

  // Form sections
  programInfo: 'Program Info',
  workProgram: 'Work Program',
  fabricProgram: 'Fabric Program',
  matchingProgram: 'Matching Program',

  // Price table
  partName: 'Part Name',
  stitch: 'Stitch',
  stitchType: 'Type',
  meter: 'Meter',
  piece: 'Piece',
  oneRs: '1 RS',
  stitchRate: 'Stitch Rate',
  oneMP: '1 M/P',
  meterPerPcs: 'MTR/PCS',
  rate: 'Rate',
  total: 'Total',
  fabricName: 'Fabric Name',
  fabricMeter: 'Fabric Meter',
  fm: 'Fabric Meter',
  totalFM: 'Total Fabric Meter',
  addPart: '+ Add Part',
  grandTotal: 'Grand Total',
  grandFabricTotal: 'Grand Fabric Total',
  grandWorkTotal: 'Grand Work Total',
  fabricBreakdown: 'Fabric Breakdown',
  savePrices: 'Save Prices',
  pricesSaved: 'Prices saved!',

  // Placeholders
  partPlaceholder: 'Part',
  fabricPlaceholder: 'Fabric',
  partSingular: 'part',
  partPlural: 'parts',

  // History
  history: 'Logs',
  noHistory: 'No changes recorded yet.',
  voiceUpload: 'Voice note uploaded',
  byPrefix: 'by ',

  // Actions
  view: 'View',
  edit: 'Edit',
  qr: 'QR',
  pdf: 'PDF',
  deleteAction: 'Delete',
  deleteConfirm: 'Delete this program?',
  deleted: 'Program deleted.',
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

  // QR errors
  qrFailed: 'Failed to generate QR',
  qrError: 'Unable to generate QR code',
  contactSupport: 'Please contact support',
  shareLinkFailed: 'Failed to generate share link',

  // Voice
  record: 'Record',
  stop: 'Stop',
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

  // Public share / PDF
  programReport: 'Program Report',
  sharedReport: 'Shared program report',
  generated: 'Generated',
  poweredBy: 'Powered by DailyOffice · Arya Designs',
  aryadesigns: 'Arya Designs',
  notFound: 'Not found',
  notFoundOrExpired: 'Program not found or link expired.',

  // Language
  language: 'Language',
} as const;

export type TranslationKey = keyof typeof en;

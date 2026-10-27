// Size Summariser — the extraction the size-summariser edge function returns
// (the model's tailor_sheet tool call after the server's checks), the settings
// row behind it, and the stored history row.
export type Confidence = 'high' | 'low';

export interface Measurement {
  key: string; label_en: string; label_hi: string; hint_hi?: string;
  value: number | null; unit: 'inch' | 'cm' | 'unknown';
  /** A non-number answer ("as per the embroidery", "sleeveless", "standard") — shown instead of a value. */
  value_text_hi?: string; value_text_en?: string;
  section?: 'upper' | 'lower' | 'other'; page: number; y_on_page?: number; confidence: Confidence;
  /** Hash of the form picture matched to this measurement by the server (tailor-diagrams/<hash>.jpg). */
  diagram?: string;
}
export interface Choice {
  key: string; label_hi: string; value_en: string; value_hi: string;
  answered: boolean; page: number; confidence: Confidence;
}
export interface Note { text_original: string; text_hi: string; page: number }
export interface Warning { severity: 'info' | 'check' | 'blocker'; text_hi: string; text_en?: string }

export interface Extraction {
  order: { order_no: string; product_name: string; garment_type: 'saree_blouse' | 'lehenga' | 'suit' | 'gown' | 'other'; stitching_tier: string; stitching_tier_hi?: string; form_title?: string };
  measurements: Measurement[];
  choices: Choice[];
  notes: Note[];
  warnings: Warning[];
  excluded_pii_detected: boolean;
}

/** app_settings.size_summariser — everything that is data, edited in Settings → Size Summariser. */
export interface SummariserSettings {
  model: string; effort: string; prompt: string; prompt_version: number;
  order_no_regex: string; measurement_min: number; measurement_max: number;
  required_fields: Record<string, string[]>;
  sheet_title: string; footer_text: string; raster_only_option_pages: boolean;
  /** Second, independent read of pages that have no text layer (blank = that check is off). */
  verify_model: string; verify_prompt: string;
}

/** stitching_extractions row (the columns the app reads). */
export interface ExtractionRow {
  id: string; order_no: string | null; form_type: string | null; model: string; effort: string | null; prompt_version: number;
  extraction: Extraction; diagrams: unknown; warnings_count: number; low_confidence_count: number;
  pii_detected: boolean; source_path: string | null; file_name: string | null; page_count: number | null;
  parent_id: string | null; est_usd: number | null; created_by: string | null; created_at: string;
}
export const EXTRACTION_COLS = 'id, order_no, form_type, model, effort, prompt_version, extraction, diagrams, warnings_count, low_confidence_count, pii_detected, source_path, file_name, page_count, parent_id, est_usd, created_by, created_at';

export const GARMENT_HI: Record<string, string> = { saree_blouse: 'साड़ी ब्लाउज़', lehenga: 'लहंगा', suit: 'सूट', gown: 'गाउन', other: 'अन्य' };

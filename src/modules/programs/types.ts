// Programs module — shared TypeScript types

export interface Program {
  id: string;
  program_uid: string;
  selling_sku: string | null;
  manufacturing_sku: string | null;
  matching: string | null;
  dropbox_gdrive_link: string | null;
  voice_note_path: string | null;
  share_token: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface ProgramMatching {
  id: string;
  program_id: string;
  company_name: string;
  matching_label: string | null;
  created_at: string;
}

export interface ProgramPrice {
  id: string;
  program_id: string;
  created_at: string;
  updated_at: string;
}

export interface ProgramPricePart {
  id: string;
  program_price_id: string;
  part_name: string | null;
  stitch: number | null;
  stitch_type: string;
  one_rs: number | null;
  stitch_rate: number | null;
  one_mp: number | null;
  meter_per_pcs: number | null;
  rate: number | null;
  total: number | null;
  fabric_name: string | null;
  fabric_meter: number | null;
  section: 'work' | 'fabric';
  sort_order: number;
  created_at: string;
}

export interface ProgramHistoryEntry {
  id: string;
  program_id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  field_changed: string | null;
  old_value: unknown;
  new_value: unknown;
  changed_at: string;
}

export interface ProgramUserPreference {
  user_id: string;
  language: 'en' | 'gu';
}

// Form-level types
export interface ProgramFormData {
  selling_sku: string;
  manufacturing_sku: string;
  dropbox_gdrive_link: string;
  matchings: { company_name: string; matching_label: string }[];
}

export interface PricePartRow {
  id?: string;
  part_name: string;
  stitch: number;
  stitch_type: string;
  one_rs: number;
  stitch_rate: number;
  one_mp: number;
  meter_per_pcs: number;
  rate: number;
  total: number;
  fabric_name: string;
  fabric_meter: number;
  section: 'work' | 'fabric';
  sort_order: number;
}

export const EMPTY_WORK_PART: PricePartRow = {
  part_name: '', stitch: 0, stitch_type: '', one_rs: 0, stitch_rate: 0, one_mp: 0,
  meter_per_pcs: 0, rate: 0, total: 0, fabric_name: '', fabric_meter: 0,
  section: 'work', sort_order: 0,
};

export const EMPTY_FABRIC_PART: PricePartRow = {
  part_name: '', stitch: 0, stitch_type: '', one_rs: 0, stitch_rate: 0, one_mp: 0,
  meter_per_pcs: 0, rate: 0, total: 0, fabric_name: '', fabric_meter: 0,
  section: 'fabric', sort_order: 0,
};

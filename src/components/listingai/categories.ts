// Garment categories for the template editor's Category select — ids and
// labels ONLY. The keyword detection lives in the edge function
// (supabase/functions/listing-ai/index.ts, CATEGORIES) — that list is the id
// contract; keep the ids here in sync with it.
export const CATEGORY_OPTIONS: { id: string; label: string }[] = [
  { id: 'kurta-set', label: 'Kurta Set' },
  { id: 'lehenga-choli', label: 'Lehenga Choli' },
  { id: 'sharara', label: 'Sharara Set' },
  { id: 'palazzo', label: 'Palazzo Set' },
  { id: 'anarkali', label: 'Anarkali' },
  { id: 'coord', label: 'Co-ord Set' },
  { id: 'saree', label: 'Saree' },
  { id: 'gown', label: 'Gown' },
  { id: 'kurta', label: 'Kurta / Kurti' },
  { id: 'dress', label: 'Dress' },
  { id: 'dupatta', label: 'Dupatta' },
];

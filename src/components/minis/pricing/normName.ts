// Matching key for names typed by hand on POs and sheets — "micro - 157",
// "MICRO-157" and "Micro 157" are the same fabric. Pure, so the evidence
// engine can import it without dragging the Supabase client along.
export const norm = (s: string | null | undefined): string => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

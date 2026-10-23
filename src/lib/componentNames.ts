// One garment component, several spellings. The master sheet's INCLUDES says
// LEHENGA and BOTTOM; costing sheets were typed as "lehanga" and PANT; a job
// stores whichever was picked. Names are compared by their letters only
// (case, spaces and punctuation ignored) plus the spelling variants seen in
// the data, so hints keyed by one spelling still find the other. Pure.
const VARIANTS: Record<string, string> = {
  LEHANGA: 'LEHENGA', LEHNGA: 'LEHENGA', LEHENGHA: 'LEHENGA', GHAGHRA: 'LEHENGA',
  DUPATA: 'DUPATTA', DUPPATTA: 'DUPATTA', DUPPATA: 'DUPATTA', CHUNNI: 'DUPATTA', ODHNI: 'DUPATTA',
  PLAZO: 'PALAZZO', PLAZZO: 'PALAZZO', PALAZO: 'PALAZZO',
  BLOUSEPIECE: 'BLOUSE', CHOLI: 'BLOUSE',
};

/** The key two spellings of one component share ("lehanga" and "LEHENGA" → LEHENGA). */
export const componentKey = (name: string): string => {
  const k = name.toUpperCase().replace(/[^A-Z]/g, '');
  return VARIANTS[k] ?? k;
};

export const sameComponent = (a: string, b: string): boolean => {
  const k = componentKey(a);
  return k !== '' && k === componentKey(b);
};

/** `first` in its order, then every name in `more` that is not one of them already. */
export const mergeComponents = (first: string[], more: string[]): string[] => {
  const out: string[] = [];
  for (const n of [...first, ...more]) {
    const t = n.trim();
    if (t && !out.some(o => sameComponent(o, t))) out.push(t);
  }
  return out;
};

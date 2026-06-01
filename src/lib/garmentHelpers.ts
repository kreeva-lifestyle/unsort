export const isDupatta = (name: string) => /dup+at*a|orhni|chunni|stole/i.test(name);
export const isLehenga = (name: string) => /lehenga|lehnga|ghaghra/i.test(name);
export const isBottomType = (name: string) => /bottom|pant|trouser|skirt|salwar|churidar|palazzo/i.test(name);
export const isBlouse = (name: string) => /blouse|choli/i.test(name);

const SKU_MFR: [RegExp, string][] = [
  [/^DRS/i, 'Dresstive'],
  [/^N?KB/i, 'Kashtbanjan'],
];
export const mfrFromSku = (sku: string): string => {
  const match = SKU_MFR.find(([re]) => re.test(sku));
  if (match) return match[1];
  if (sku && !/\d/.test(sku)) return 'Arya Designs';
  return '';
};

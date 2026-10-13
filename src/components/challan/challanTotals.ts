// Challan money math in one place, pure and testable. Used by the form's
// live totals, by openEdit (to tell a manual round-off from an automatic
// one) and by the harness.
//
// Round-off: automatic = to the nearest rupee (JS half-up, so 2042.50 →
// 2043, +0.50). Manual = whatever the operator typed (owner's ask: bring
// ₹2,043 to ₹2,040 or ₹2,050); the column is numeric(5,2), so ±999.99.
// Either way total = afterAll + roundOff, stored as sent — the DB RPCs do
// not recompute it, and every downstream figure (outstanding, revenue,
// return credit) reads the stored total.
export interface TotalsItem { quantity: number; price: number; discount_type?: string; discount_value?: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

export const computeItemLineTotal = (it: TotalsItem) => r2(it.quantity * it.price);
export const computeItemDiscount = (it: TotalsItem) => {
  const d = it.discount_value || 0;
  const raw = it.discount_type === 'percentage' ? (it.quantity * it.price * d / 100) : d;
  return r2(raw);
};
export const computeItemTotal = (it: TotalsItem) => r2(computeItemLineTotal(it) - computeItemDiscount(it));

export const ROUND_OFF_LIMIT = 999.99;

export function challanTotals(items: TotalsItem[], shippingCharges: number, isReturn: boolean, manualRoundOff: number | null) {
  // Subtotal = raw line totals (pre-discount). Discount = raw sum as entered.
  // Total = subtotal - discount + shipping (can go negative while editing).
  const subtotal = r2(items.reduce((s, i) => s + computeItemLineTotal(i), 0));
  const totalDiscount = r2(items.reduce((s, i) => s + computeItemDiscount(i), 0));
  // Returns never carry shipping/porter charges (owner policy) — the field is
  // hidden in return mode and any lingering value is ignored here.
  const clampedShipping = isReturn ? 0 : Math.max(0, shippingCharges);
  const afterAll = r2(subtotal - totalDiscount + clampedShipping);
  const roundOff = manualRoundOff === null ? r2(Math.round(afterAll) - afterAll) : r2(manualRoundOff);
  const grandTotal = r2(afterAll + roundOff);
  return { subtotal, totalDiscount, clampedShipping, afterAll, roundOff, grandTotal };
}

/** The round-off the form would apply on its own for these lines. */
export const autoRoundOff = (items: TotalsItem[], shippingCharges: number, isReturn: boolean) =>
  challanTotals(items, shippingCharges, isReturn, null).roundOff;

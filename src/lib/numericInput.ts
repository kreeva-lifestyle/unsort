import type { KeyboardEvent } from 'react';

// <input type="number"> still accepts letters on several browsers (e/E for
// exponents, and iOS keyboards that type whatever they like). Block every
// single-character key that is not a digit, a decimal point or (when the
// caller allows it) a minus sign. Multi-character keys — Backspace, Delete,
// Tab, Enter, arrows, Home/End — and modifier shortcuts (copy / paste /
// select-all) pass through untouched.
export const numericKeyDown = (e: KeyboardEvent<HTMLInputElement>, allowNegative = false) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k.length !== 1) return;
  if (k >= '0' && k <= '9') return;
  if (k === '.') return;
  if (k === '-' && allowNegative) return;
  e.preventDefault();
};

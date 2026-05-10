import type { KeyboardEvent } from 'react';

const BLOCKED = new Set(['e', 'E', '+']);

export const numericKeyDown = (e: KeyboardEvent<HTMLInputElement>, allowNegative = false) => {
  if (BLOCKED.has(e.key)) e.preventDefault();
  if (!allowNegative && e.key === '-') e.preventDefault();
};

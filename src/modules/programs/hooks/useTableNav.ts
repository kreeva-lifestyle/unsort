import { useCallback } from 'react';

// Keyboard navigation for price tables:
// Tab → next cell in same row, Enter → same column next row
// data-row and data-col attributes identify position.
export function useTableNav(tableId: string) {
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    const el = e.target as HTMLElement;
    const row = Number(el.dataset.row);
    const col = Number(el.dataset.col);
    if (isNaN(row) || isNaN(col)) return;

    let nextRow = row;
    let nextCol = col;

    if (e.key === 'Enter') {
      e.preventDefault();
      nextRow = row + 1;
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      nextCol = col + 1;
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      nextCol = col - 1;
    }

    const table = document.getElementById(tableId);
    if (!table) return;
    const next = table.querySelector<HTMLElement>(`[data-row="${nextRow}"][data-col="${nextCol}"]`);
    if (next) {
      next.focus();
      if (next instanceof HTMLInputElement) next.select();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      // Wrap to first col of next row
      const wrap = table.querySelector<HTMLElement>(`[data-row="${row + 1}"][data-col="0"]`);
      if (wrap) { wrap.focus(); if (wrap instanceof HTMLInputElement) wrap.select(); }
    }
  }, [tableId]);

  return onKeyDown;
}

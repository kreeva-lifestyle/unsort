// Dialog focus for PbModal (copy-and-a11y.md §B3, mobile.md §6): on open,
// focus the title unless a field already took focus (autoFocus); trap Tab
// inside; make the Playbook root inert; on close, return focus to the opener.
import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let inertCount = 0;

// The element focused before the current one. A field with autoFocus takes
// focus before the effect below runs, so the opener is the one before it.
let prevFocus: HTMLElement | null = null;
let curFocus: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', e => {
    if (e.target instanceof HTMLElement && e.target !== curFocus) { prevFocus = curFocus; curFocus = e.target; }
  }, true);
}

export function usePbDialog(open: boolean, box: RefObject<HTMLElement | null>, title: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const el = box.current;
    const active = document.activeElement as HTMLElement | null;
    const opener = el && active && el.contains(active) ? (prevFocus && !el.contains(prevFocus) ? prevFocus : null) : active;
    if (el && !el.contains(document.activeElement)) title.current?.focus({ preventScroll: true });

    const root = document.querySelector<HTMLElement>('.pb-scroll');
    inertCount++;
    // Everything inside .pb-scroll goes inert while a dialog is open. Toasts
    // (PbToasts) and other dialogs must stay portalled to <body>, outside it,
    // or screen readers miss them while a sheet is open.
    root?.setAttribute('inert', '');

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(x => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el?.addEventListener('keydown', onKey);
    return () => {
      el?.removeEventListener('keydown', onKey);
      inertCount = Math.max(0, inertCount - 1);
      if (!inertCount) root?.removeAttribute('inert');
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, box, title]);
}

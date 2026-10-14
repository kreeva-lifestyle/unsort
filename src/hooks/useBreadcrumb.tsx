// Header breadcrumb: "Page / crumb / crumb". Two sources, combined in order:
//   - `set(crumbs)`  — a page's own trail (Minis' tool label, Cash Challan's
//                      "Ledger"), replaced whole, cleared with null;
//   - `useCrumb(l)`  — ONE crumb for an open sub-view (a costing sheet, a PO
//                      detail), appended after the page's crumbs while the
//                      label is non-null and gone the moment it closes.
// Nested sub-views mount in order, so their crumbs read outer → inner.
//
// Two contexts on purpose: the actions never change, the trail changes on
// every relabel (a costing sheet pushes its SKU as typed). Pages and hooks
// read only the actions, so a keystroke in a sheet re-renders the Header,
// not the page that hosts the sheet and every tool under it.
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';

interface Layer { id: number; label: string }
interface Actions {
  set: (c: string[] | null) => void;
  push: (id: number, label: string) => void;
  remove: (id: number) => void;
}
const ActionsCtx = createContext<Actions>({ set: () => {}, push: () => {}, remove: () => {} });
const CrumbsCtx = createContext<string[]>([]);

/** Pages: `set` (and useCrumb's push/remove). Stable — never re-renders a consumer. */
export const useBreadcrumb = () => useContext(ActionsCtx);
/** Header only: the trail to display. */
export const useCrumbs = () => useContext(CrumbsCtx);

let seq = 0;
export function useCrumb(label: string | null) {
  const { push, remove } = useBreadcrumb();
  const id = useRef(0);
  if (!id.current) id.current = ++seq;
  useEffect(() => {
    if (label == null) return;
    const i = id.current;
    push(i, label);
    return () => remove(i);
  }, [label, push, remove]);
}

export const BreadcrumbProvider = ({ children }: { children: React.ReactNode }) => {
  const [base, setBase] = useState<string[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const set = useCallback((c: string[] | null) => setBase(c || []), []);
  // A relabel (same id) keeps its position; a new id goes on the end.
  const push = useCallback((id: number, label: string) => setLayers(ls =>
    ls.some(l => l.id === id) ? ls.map(l => (l.id === id ? { id, label } : l)) : [...ls, { id, label }]), []);
  const remove = useCallback((id: number) => setLayers(ls => ls.filter(l => l.id !== id)), []);
  const actions = useMemo(() => ({ set, push, remove }), [set, push, remove]);
  const crumbs = useMemo(() => [...base, ...layers.map(l => l.label)], [base, layers]);
  return (
    <ActionsCtx.Provider value={actions}>
      <CrumbsCtx.Provider value={crumbs}>{children}</CrumbsCtx.Provider>
    </ActionsCtx.Provider>
  );
};

import { createContext, useContext, useState, useCallback } from 'react';

interface BreadcrumbCtx { crumbs: string[]; set: (c: string[] | null) => void }
const Ctx = createContext<BreadcrumbCtx>({ crumbs: [], set: () => {} });

export const useBreadcrumb = () => useContext(Ctx);

export const BreadcrumbProvider = ({ children }: { children: React.ReactNode }) => {
  const [crumbs, setCrumbs] = useState<string[]>([]);
  const set = useCallback((c: string[] | null) => setCrumbs(c || []), []);
  return <Ctx.Provider value={{ crumbs, set }}>{children}</Ctx.Provider>;
};

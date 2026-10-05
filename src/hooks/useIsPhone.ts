// Phone-or-not at runtime, on the same breakpoint as index.css (≤768px), for
// screens that swap a whole layout rather than restyle one. Updates on
// rotation / window resize.
import { useState, useEffect } from 'react';

const QUERY = '(max-width: 768px)';

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setPhone(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}

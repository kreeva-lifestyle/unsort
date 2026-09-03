// The product categories managed in Settings → Categories (the `products`
// table: one row per category with its components). Loaded once per mount
// and shared by the costing editor, the Price Projector and the pricing
// thresholds so every screen offers the same list.
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { friendlyError } from '../../../lib/friendlyError';

export function useSettingsCategories(addToast?: (m: string, t?: string) => void): { categories: string[]; loaded: boolean } {
  const [categories, setCategories] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    supabase.from('products').select('name').eq('is_active', true).order('name').limit(500)
      .then(({ data, error }) => {
        if (error) addToast?.('Could not load categories — ' + friendlyError(error), 'error');
        setCategories([...new Set((data || []).map(r => String(r.name || '').trim()).filter(Boolean))]);
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { categories, loaded };
}

// Module-scoped i18n hook — Programs only. Does NOT touch any other module.
import { useState, useEffect, useCallback } from 'react';
import { en, type TranslationKey } from '../i18n/en';
import { gu } from '../i18n/gu';
import { getLanguagePref, setLanguagePref } from '../lib/supabase-rpc';

const LANGS = { en, gu } as const;
type Lang = keyof typeof LANGS;

export function useT() {
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => { getLanguagePref().then(l => setLang(l)); }, []);

  const t = useCallback((key: TranslationKey): string => {
    return LANGS[lang][key] ?? LANGS.en[key] ?? key;
  }, [lang]);

  const toggleLang = useCallback(async () => {
    const next: Lang = lang === 'en' ? 'gu' : 'en';
    setLang(next);
    await setLanguagePref(next);
  }, [lang]);

  return { t, lang, toggleLang };
}

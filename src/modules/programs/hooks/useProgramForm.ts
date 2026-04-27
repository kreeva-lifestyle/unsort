// Form state hook for add/edit program
import { useState, useCallback } from 'react';
import { upsertProgram, upsertProgramPrice } from '../lib/supabase-rpc';
import type { ProgramFormData, Program, PricePartRow } from '../types';

const EMPTY_FORM: ProgramFormData = {
  selling_sku: '', manufacturing_sku: '',
  dropbox_gdrive_link: '', matchings: [],
};

export function useProgramForm(onSuccess: () => void) {
  const [form, setForm] = useState<ProgramFormData>(EMPTY_FORM);
  const [editing, setEditing] = useState<Program | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const open = useCallback((program?: Program, matchings?: { company_name: string; matching_label: string }[]) => {
    if (program) {
      setEditing(program);
      setForm({
        selling_sku: program.selling_sku || '',
        manufacturing_sku: program.manufacturing_sku || '',
        dropbox_gdrive_link: program.dropbox_gdrive_link || '',
        matchings: matchings || [],
      });
    } else {
      setEditing(null);
      setForm(EMPTY_FORM);
    }
    setError('');
  }, []);

  const close = useCallback(() => { setEditing(null); setForm(EMPTY_FORM); setError(''); }, []);

  const save = useCallback(async (workParts?: PricePartRow[], fabricParts?: PricePartRow[]) => {
    setError('');
    if (!form.selling_sku.trim() && !form.manufacturing_sku.trim()) {
      setError('skuRequired');
      return false;
    }
    const cleanForm = { ...form, matchings: form.matchings.filter(m => m.company_name.trim()) };
    setSaving(true);
    const { result, error: rpcErr } = await upsertProgram(cleanForm, editing?.id, editing?.updated_at);
    if (rpcErr) { setSaving(false); setError(rpcErr.message || 'Network error'); return false; }
    if (!result) { setSaving(false); setError('No response from server'); return false; }
    if (!result.ok) { setSaving(false); setError(result.error || 'Unknown error'); return false; }

    // Save price parts if provided
    if (result.id && (workParts || fabricParts)) {
      const allParts = [
        ...(workParts || []).map((p, i) => ({ ...p, section: 'work' as const, sort_order: i })),
        ...(fabricParts || []).map((p, i) => ({ ...p, section: 'fabric' as const, sort_order: i + 1000 })),
      ];
      const { error: priceErr } = await upsertProgramPrice(result.id, allParts);
      if (priceErr) { setSaving(false); setError('Program saved but prices failed: ' + priceErr.message); return false; }
    }

    setSaving(false);
    onSuccess();
    close();
    return true;
  }, [form, editing, onSuccess, close]);

  const setField = useCallback(<K extends keyof ProgramFormData>(key: K, value: ProgramFormData[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  }, []);

  return { form, setField, editing, error, saving, open, close, save, isOpen: editing !== null || form !== EMPTY_FORM };
}

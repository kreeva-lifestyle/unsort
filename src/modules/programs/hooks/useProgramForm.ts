// Form state hook for add/edit program
import { useState, useCallback } from 'react';
import { upsertProgram } from '../lib/supabase-rpc';
import type { ProgramFormData, Program } from '../types';

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

  const save = useCallback(async () => {
    setError('');
    if (!form.selling_sku.trim() && !form.manufacturing_sku.trim()) {
      setError('skuRequired');
      return false;
    }
    setSaving(true);
    const { result, error: rpcErr } = await upsertProgram(form, editing?.id, editing?.updated_at);
    setSaving(false);
    if (rpcErr) { setError(rpcErr.message); return false; }
    if (result && !result.ok) { setError(result.error || 'Unknown error'); return false; }
    onSuccess();
    close();
    return true;
  }, [form, editing, onSuccess, close]);

  const setField = useCallback(<K extends keyof ProgramFormData>(key: K, value: ProgramFormData[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  }, []);

  return { form, setField, editing, error, saving, open, close, save, isOpen: editing !== null || form !== EMPTY_FORM };
}

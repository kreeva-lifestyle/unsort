import { useState, useEffect } from 'react';
import { useT } from './hooks/useT';
import { useProgramForm } from './hooks/useProgramForm';
import { fetchPriceWithParts } from './lib/supabase-rpc';
import ProgramsList from './ProgramsList';
import ProgramForm from './ProgramForm';
import ProgramDetail from './ProgramDetail';
import QRGenerator from './QRGenerator';
import PDFExport from './PDFExport';
import { useNotifications } from '../../hooks/useNotifications';
import type { Program, PricePartRow } from './types';

export default function ProgramsModule() {
  const { t } = useT();
  const { addToast } = useNotifications();
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [qrProgram, setQrProgram] = useState<Program | null>(null);
  const [pdfProgramId, setPdfProgramId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editWorkParts, setEditWorkParts] = useState<PricePartRow[] | undefined>();
  const [editFabricParts, setEditFabricParts] = useState<PricePartRow[] | undefined>();

  // Browser back button support
  useEffect(() => {
    const onPop = () => {
      if (showForm) { setShowForm(false); return; }
      if (qrProgram) { setQrProgram(null); return; }
      if (view === 'detail') { setView('list'); setDetailId(null); return; }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [showForm, qrProgram, view]);

  const form = useProgramForm(() => {
    addToast(t('saved'), 'success');
    setShowForm(false);
  });

  const handleAdd = () => {
    setEditWorkParts(undefined);
    setEditFabricParts(undefined);
    form.open();
    setShowForm(true);
    window.history.pushState({ view: 'program-form' }, '');
  };

  const handleEdit = async (p: Program, matchings: { company_name: string; matching_label: string }[]) => {
    const { parts } = await fetchPriceWithParts(p.id);
    const wk = parts.filter(pt => (pt.section || 'work') === 'work').map(pt => ({
      id: pt.id, part_name: pt.part_name || '', stitch: Number(pt.stitch || 0),
      stitch_type: pt.stitch_type || '',
      one_rs: Number(pt.one_rs || 0), stitch_rate: Number(pt.stitch_rate || 0),
      one_mp: Number(pt.one_mp || 0), meter_per_pcs: Number(pt.meter_per_pcs || 0),
      rate: Number(pt.rate || 0), total: Number(pt.total || 0),
      fabric_name: pt.fabric_name || '', fabric_meter: Number(pt.fabric_meter || 0),
      section: 'work' as const, sort_order: pt.sort_order,
    }));
    const fb = parts.filter(pt => pt.section === 'fabric').map(pt => ({
      id: pt.id, part_name: pt.part_name || '', stitch: 0, stitch_type: '', one_rs: 0, stitch_rate: 0,
      one_mp: 0, meter_per_pcs: 0, rate: 0, total: 0,
      fabric_name: pt.fabric_name || '', fabric_meter: Number(pt.fabric_meter || 0),
      section: 'fabric' as const, sort_order: pt.sort_order,
    }));
    setEditWorkParts(wk.length > 0 ? wk : undefined);
    setEditFabricParts(fb.length > 0 ? fb : undefined);
    form.open(p, matchings);
    setShowForm(true);
    window.history.pushState({ view: 'program-form' }, '');
  };

  const handleView = (p: Program) => { setDetailId(p.id); setView('detail'); window.history.pushState({ view: 'program-detail' }, ''); };

  const handleDetailEdit = async (p: Program, matchings: { company_name: string; matching_label: string }[]) => {
    await handleEdit(p, matchings);
  };

  return (
    <>
      {view === 'list' && (
        <ProgramsList
          onAdd={handleAdd}
          onEdit={handleEdit}
          onView={handleView}
          onQR={p => setQrProgram(p)}
          onPDF={p => setPdfProgramId(p.id)}
        />
      )}

      {view === 'detail' && detailId && (
        <ProgramDetail
          programId={detailId}
          onClose={() => { setView('list'); setDetailId(null); }}
          onEdit={handleDetailEdit}
          t={t}
        />
      )}

      {showForm && (
        <ProgramForm
          key={form.editing?.id ?? 'new'}
          form={form.form}
          setField={form.setField}
          editing={form.editing}
          error={form.error}
          saving={form.saving}
          onSave={(workParts, fabricParts) => form.save(workParts, fabricParts)}
          onClose={() => { form.close(); setShowForm(false); setEditWorkParts(undefined); setEditFabricParts(undefined); }}
          t={t}
          initialWorkParts={editWorkParts}
          initialFabricParts={editFabricParts}
        />
      )}

      {qrProgram && <QRGenerator program={qrProgram} onClose={() => setQrProgram(null)} t={t} />}
      {pdfProgramId && <PDFExport programId={pdfProgramId} onClose={() => setPdfProgramId(null)} t={t} />}
    </>
  );
}

// Re-export the public share view for the app router
export { default as PublicShareView } from './PublicShareView';

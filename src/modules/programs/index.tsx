import { useState } from 'react';
import { useT } from './hooks/useT';
import { useProgramForm } from './hooks/useProgramForm';
import ProgramsList from './ProgramsList';
import ProgramForm from './ProgramForm';
import ProgramDetail from './ProgramDetail';
import QRGenerator from './QRGenerator';
import PDFExport from './PDFExport';
import { useNotifications } from '../../hooks/useNotifications';
import type { Program } from './types';

export default function ProgramsModule() {
  const { t } = useT();
  const { addToast } = useNotifications();
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [qrProgram, setQrProgram] = useState<Program | null>(null);
  const [pdfProgramId, setPdfProgramId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const form = useProgramForm(() => {
    addToast(t('saved'), 'success');
    setShowForm(false);
  });

  const handleAdd = () => { form.open(); setShowForm(true); };
  const handleEdit = (p: Program, matchings: { company_name: string; matching_label: string }[]) => {
    form.open(p, matchings);
    setShowForm(true);
  };
  const handleView = (p: Program) => { setDetailId(p.id); setView('detail'); };

  const handleDetailEdit = async (p: Program, matchings: { company_name: string; matching_label: string }[]) => {
    form.open(p, matchings);
    setShowForm(true);
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
          form={form.form}
          setField={form.setField}
          editing={form.editing}
          error={form.error}
          saving={form.saving}
          onSave={form.save}
          onClose={() => { form.close(); setShowForm(false); }}
          t={t}
        />
      )}

      {qrProgram && <QRGenerator program={qrProgram} onClose={() => setQrProgram(null)} t={t} />}
      {pdfProgramId && <PDFExport programId={pdfProgramId} onClose={() => setPdfProgramId(null)} t={t} />}
    </>
  );
}

// Re-export the public share view for the app router
export { default as PublicShareView } from './PublicShareView';

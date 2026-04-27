import { useState, useEffect } from 'react';
import { T } from '../../lib/theme';
import { fetchProgramById, fetchMatchings, fetchPriceWithParts, fetchHistory } from './lib/supabase-rpc';
import { toDirectImageUrl } from './lib/image-url-converters';
import { getVoiceNoteUrl } from './lib/supabase-rpc';
import type { Program, ProgramMatching, ProgramPricePart, ProgramHistoryEntry } from './types';
import type { TranslationKey } from './i18n/en';

interface Props {
  programId: string;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}

export default function PDFExport({ programId, onClose, t }: Props) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: program }, { data: matchings }, { parts }, { data: history }] = await Promise.all([
        fetchProgramById(programId),
        fetchMatchings(programId),
        fetchPriceWithParts(programId),
        fetchHistory(programId),
      ]);
      setLoading(false);
      if (!program) return;
      openPrintWindow(program, matchings, parts, history);
      onClose();
    })();
  }, [programId, onClose]);

  if (loading) return <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)', color: T.tx }}>{t('loading')}</div>;
  return null;
}

function openPrintWindow(
  p: Program,
  matchings: ProgramMatching[],
  parts: ProgramPricePart[],
  history: ProgramHistoryEntry[],
) {
  const w = window.open('', '_blank');
  if (!w) return;
  const esc = (s: string | null) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const imageUrl = p.dropbox_gdrive_link ? toDirectImageUrl(p.dropbox_gdrive_link) : '';
  const voiceUrl = p.voice_note_path ? getVoiceNoteUrl(p.voice_note_path) : '';
  const grandTotal = parts.reduce((s, pt) => s + Number(pt.total || 0), 0);

  w.document.write(`<!doctype html><html><head><title>Program ${esc(p.program_uid)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #222; margin: 0; padding: 0; font-size: 11px; }
      .header { text-align: center; margin-bottom: 16px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      h2 { font-size: 13px; margin: 16px 0 8px; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0; }
      th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; font-size: 10px; }
      th { background: #f5f5f5; font-weight: 600; }
      .right { text-align: right; }
      .meta { display: flex; gap: 24px; margin: 8px 0; }
      .meta-item { }
      .meta-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
      .meta-value { font-size: 12px; font-weight: 600; margin-top: 2px; }
      .pill { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 600; background: #eef; color: #6366F1; margin: 0 2px; }
      .total-row { font-weight: 700; background: #f0f0ff; }
      .history-entry { padding: 4px 0; border-bottom: 1px solid #eee; font-size: 9px; color: #666; }
      .footer { text-align: center; font-size: 8px; color: #aaa; margin-top: 20px; border-top: 1px solid #eee; padding-top: 8px; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head><body>
    <div class="header">
      <h1>Arya Designs</h1>
      <p style="color:#666;font-size:10px;margin:2px 0">Program Report — ${esc(p.program_uid)}</p>
      <p style="color:#888;font-size:9px">Generated ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
    </div>

    <div class="meta">
      <div class="meta-item"><div class="meta-label">Selling SKU</div><div class="meta-value">${esc(p.selling_sku) || '—'}</div></div>
      <div class="meta-item"><div class="meta-label">Manufacturing SKU</div><div class="meta-value">${esc(p.manufacturing_sku) || '—'}</div></div>
      <div class="meta-item"><div class="meta-label">Matching</div><div class="meta-value">${esc(p.matching) || '—'}</div></div>
    </div>
  `);

  // Image
  if (imageUrl) {
    w.document.write(`<div style="margin:12px 0"><img src="${esc(imageUrl)}" style="max-width:100%;max-height:200px;border:1px solid #ddd;border-radius:4px" onerror="this.style.display='none'"/></div>`);
  }

  // Matchings
  if (matchings.length > 0) {
    w.document.write(`<h2>Companies (${matchings.length})</h2><div>`);
    matchings.forEach(m => { w.document.write(`<span class="pill">${esc(m.company_name)}${m.matching_label ? ' · ' + esc(m.matching_label) : ''}</span> `); });
    w.document.write('</div>');
  }

  // Voice note link
  if (voiceUrl) {
    w.document.write(`<h2>Voice Note</h2><audio controls src="${esc(voiceUrl)}" style="width:100%;height:32px"></audio>`);
  }

  // Price breakdown
  if (parts.length > 0) {
    const workParts = parts.filter(pt => (pt.section || 'work') === 'work');
    const fabricPartsList = parts.filter(pt => pt.section === 'fabric');
    if (workParts.length > 0) {
      w.document.write(`<h2>Work Program</h2>
        <table><thead><tr><th>Part</th><th class="right">Stitch</th><th class="right">1 RS</th><th class="right">Stitch Rate</th><th class="right">1 M/P</th><th class="right">MTR/PCS</th><th class="right">Rate</th><th class="right">Total</th><th>Fabric</th><th class="right">Fabric Meter</th></tr></thead><tbody>`);
      workParts.forEach(pt => {
        w.document.write(`<tr><td>${esc(pt.part_name)}</td><td class="right">${Number(pt.stitch || 0)}</td><td class="right">${Number(pt.one_rs || 0).toFixed(2)}</td><td class="right">${Number(pt.stitch_rate || 0).toFixed(2)}</td><td class="right">${Number(pt.one_mp || 0)}</td><td class="right">${Number(pt.meter_per_pcs || 0).toFixed(2)}</td><td class="right">${Number(pt.rate || 0).toFixed(2)}</td><td class="right">₹${Number(pt.total || 0).toFixed(2)}</td><td>${esc(pt.fabric_name)}</td><td class="right">${Number(pt.fabric_meter || 0).toFixed(2)}</td></tr>`);
      });
      w.document.write(`<tr class="total-row"><td colspan="7" style="text-align:right">Grand Total</td><td class="right">₹${grandTotal.toFixed(2)}</td><td style="text-align:right">Total FM</td><td class="right">${workParts.reduce((s, p) => s + Number(p.fabric_meter || 0), 0).toFixed(2)}</td></tr></tbody></table>`);
    }
    if (fabricPartsList.length > 0) {
      const fabricTotal = fabricPartsList.reduce((s, p) => s + Number(p.fabric_meter || 0), 0);
      w.document.write(`<h2>Fabric Program</h2><table><thead><tr><th>Part</th><th class="right">Fabric Meter</th></tr></thead><tbody>`);
      fabricPartsList.forEach(pt => { w.document.write(`<tr><td>${esc(pt.part_name)}</td><td class="right">${Number(pt.fabric_meter || 0).toFixed(2)}</td></tr>`); });
      w.document.write(`<tr class="total-row"><td style="text-align:right">Grand Total</td><td class="right">${fabricTotal.toFixed(2)}</td></tr></tbody></table>`);
      const grandFabric = workParts.reduce((s, p) => s + Number(p.fabric_meter || 0), 0) + fabricTotal;
      w.document.write(`<p style="text-align:right;font-weight:700;color:#0066cc">Grand Fabric Total: ${grandFabric.toFixed(2)} m</p>`);
    }
  }

  // History
  if (history.length > 0) {
    w.document.write(`<h2>Edit History (${history.length})</h2>`);
    history.slice(0, 20).forEach(h => {
      w.document.write(`<div class="history-entry"><strong>${esc(h.action)}</strong>${h.field_changed ? ' · ' + esc(h.field_changed) : ''} — ${h.user_email || 'System'} · ${new Date(h.changed_at).toLocaleString('en-IN')}</div>`);
    });
  }

  w.document.write(`<div class="footer">Powered by DailyOffice · Arya Designs</div></body></html>`);
  w.document.close();
  w.print();
}

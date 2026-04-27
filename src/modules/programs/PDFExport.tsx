import { useState, useEffect } from 'react';
import { T } from '../../lib/theme';
import { fetchProgramById, fetchMatchings, fetchPriceWithParts } from './lib/supabase-rpc';
import { toDirectImageUrl } from './lib/image-url-converters';
import type { Program, ProgramMatching, ProgramPricePart } from './types';
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
      let program, matchings, parts;
      try {
        const [r1, r2, r3] = await Promise.all([
          fetchProgramById(programId), fetchMatchings(programId), fetchPriceWithParts(programId),
        ]);
        program = r1.data; matchings = r2.data; parts = r3.parts;
      } catch { setLoading(false); onClose(); return; }
      setLoading(false);
      if (!program) { onClose(); return; }
      const L = {
        aryadesigns: t('aryadesigns'), programReport: t('programReport'), generated: t('generated'),
        sellingSku: t('sellingSkuLabel'), manufacturingSku: t('manufacturingSkuLabel'),
        brands: t('brands'), workProgram: t('workProgram'),
        partName: t('partName'), stitch: t('stitch'), stitchType: t('stitchType'),
        oneRs: t('oneRs'), stitchRate: t('stitchRate'), oneMP: t('oneMP'), meterPerPcs: t('meterPerPcs'),
        rate: t('rate'), total: t('total'), fabricName: t('fabricName'), fabricMeter: t('fabricMeter'),
        grandTotal: t('grandTotal'), totalFM: t('totalFM'), fabricProgram: t('fabricProgram'),
        grandFabricTotal: t('grandFabricTotal'), poweredBy: t('poweredBy'),
        meter: t('meter'), piece: t('piece'),
      };
      openPrintWindow(program, matchings, parts, L);
      onClose();
    })();
  }, [programId, onClose, t]);

  if (loading) return <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)', color: T.tx }}>{t('loading')}</div>;
  return null;
}

function openPrintWindow(p: Program, matchings: ProgramMatching[], parts: ProgramPricePart[], L: Record<string, string>) {
  const w = window.open('', '_blank');
  if (!w) return;
  const esc = (s: string | null) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const imageUrl = p.dropbox_gdrive_link ? toDirectImageUrl(p.dropbox_gdrive_link) : '';
  const typeLabel = (v: string) => v === 'meter' ? L.meter : v === 'piece' ? L.piece : '';

  w.document.write(`<!doctype html><html><head><title>${L.programReport} ${esc(p.program_uid)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #222; margin: 0; padding: 0; font-size: 11px; }
      .header { text-align: center; margin-bottom: 16px; }
      h1 { font-size: 18px; margin: 0 0 4px; } h2 { font-size: 13px; margin: 16px 0 8px; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0; }
      th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; font-size: 10px; }
      th { background: #f5f5f5; font-weight: 600; } .right { text-align: right; }
      .meta { display: flex; gap: 24px; margin: 8px 0; }
      .meta-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
      .meta-value { font-size: 12px; font-weight: 600; margin-top: 2px; }
      .pill { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 600; background: #eef; color: #6366F1; margin: 0 2px; }
      .total-row { font-weight: 700; background: #f0f0ff; }
      .footer { text-align: center; font-size: 8px; color: #aaa; margin-top: 20px; border-top: 1px solid #eee; padding-top: 8px; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    <div class="header"><h1>${esc(L.aryadesigns)}</h1>
      <p style="color:#666;font-size:10px;margin:2px 0">${esc(L.programReport)} — ${esc(p.program_uid)}</p>
      <p style="color:#888;font-size:9px">${esc(L.generated)} ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
    </div>
    <div class="meta">
      <div><div class="meta-label">${esc(L.sellingSku)}</div><div class="meta-value">${esc(p.selling_sku) || '—'}</div></div>
      <div><div class="meta-label">${esc(L.manufacturingSku)}</div><div class="meta-value">${esc(p.manufacturing_sku) || '—'}</div></div>
    </div>`);

  if (imageUrl) w.document.write(`<div style="margin:12px 0"><img src="${esc(imageUrl)}" style="max-width:100%;max-height:200px;border:1px solid #ddd;border-radius:4px" onerror="this.style.display='none'"/></div>`);
  if (matchings.length > 0) {
    w.document.write(`<h2>${esc(L.brands)} (${matchings.length})</h2><div>`);
    matchings.forEach(m => { w.document.write(`<span class="pill">${esc(m.company_name)}${m.matching_label ? ' · ' + esc(m.matching_label) : ''}</span> `); });
    w.document.write('</div>');
  }


  if (parts.length > 0) {
    const workParts = parts.filter(pt => (pt.section || 'work') === 'work');
    const fabricPartsList = parts.filter(pt => pt.section === 'fabric');
    const grandTotal = workParts.reduce((s, pt) => s + Number(pt.total || 0), 0);
    if (workParts.length > 0) {
      w.document.write(`<h2>${esc(L.workProgram)}</h2><table><thead><tr><th>${esc(L.partName)}</th><th class="right">${esc(L.stitch)}</th><th>${esc(L.stitchType)}</th><th class="right">${esc(L.oneRs)}</th><th class="right">${esc(L.stitchRate)}</th><th class="right">${esc(L.oneMP)}</th><th class="right">${esc(L.meterPerPcs)}</th><th class="right">${esc(L.rate)}</th><th class="right">${esc(L.total)}</th><th>${esc(L.fabricName)}</th><th class="right">${esc(L.fabricMeter)}</th></tr></thead><tbody>`);
      workParts.forEach(pt => {
        w.document.write(`<tr><td>${esc(pt.part_name)}</td><td class="right">${Number(pt.stitch || 0)}</td><td>${esc(typeLabel(pt.stitch_type))}</td><td class="right">${Number(pt.one_rs || 0).toFixed(2)}</td><td class="right">${Number(pt.stitch_rate || 0).toFixed(2)}</td><td class="right">${Number(pt.one_mp || 0)}</td><td class="right">${Number(pt.meter_per_pcs || 0).toFixed(2)}</td><td class="right">${Number(pt.rate || 0).toFixed(2)}</td><td class="right">��${Number(pt.total || 0).toFixed(2)}</td><td>${esc(pt.fabric_name)}</td><td class="right">${Number(pt.fabric_meter || 0).toFixed(2)}</td></tr>`);
      });
      w.document.write(`<tr class="total-row"><td colspan="8" style="text-align:right">${esc(L.grandTotal)}</td><td class="right">₹${grandTotal.toFixed(2)}</td><td style="text-align:right">${esc(L.totalFM)}</td><td class="right">${workParts.reduce((s, pt) => s + Number(pt.fabric_meter || 0), 0).toFixed(2)}</td></tr></tbody></table>`);
    }
    if (fabricPartsList.length > 0) {
      const fabricTotal = fabricPartsList.reduce((s, pt) => s + Number(pt.fabric_meter || 0), 0);
      w.document.write(`<h2>${esc(L.fabricProgram)}</h2><table><thead><tr><th>${esc(L.partName)}</th><th class="right">${esc(L.fabricMeter)}</th></tr></thead><tbody>`);
      fabricPartsList.forEach(pt => { w.document.write(`<tr><td>${esc(pt.part_name)}</td><td class="right">${Number(pt.fabric_meter || 0).toFixed(2)}</td></tr>`); });
      w.document.write(`<tr class="total-row"><td style="text-align:right">${esc(L.grandTotal)}</td><td class="right">${fabricTotal.toFixed(2)}</td></tr></tbody></table>`);
      const grandFabric = workParts.reduce((s, pt) => s + Number(pt.fabric_meter || 0), 0) + fabricTotal;
      w.document.write(`<p style="text-align:right;font-weight:700;color:#0066cc">${esc(L.grandFabricTotal)}: ${grandFabric.toFixed(2)} m</p>`);
    }
  }
  w.document.write(`<div class="footer">${esc(L.poweredBy)}</div></body></html>`);
  w.document.close(); w.print();
}

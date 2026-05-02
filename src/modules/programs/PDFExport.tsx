import { useState, useEffect } from 'react';
import QRCodeLib from 'qrcode';
import { T } from '../../lib/theme';
import { fetchProgramById, fetchMatchings, fetchPriceWithParts, generateShareToken } from './lib/supabase-rpc';
import { toDirectImageUrl } from './lib/image-url-converters';
import { getShareUrl } from './lib/share-token';
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
      let qrDataUrl = '';
      if (program.voice_note_path) {
        let token = program.share_token;
        if (!token) { const r = await generateShareToken(program.id); token = r.token; }
        if (token) {
          try { qrDataUrl = await QRCodeLib.toDataURL(getShareUrl(token), { width: 120, margin: 1 }); } catch {}
        }
      }
      const L = {
        aryadesigns: t('aryadesigns'), programReport: t('programReport'), generated: t('generated'),
        sellingSku: t('sellingSkuLabel'), manufacturingSku: t('manufacturingSkuLabel'),
        brands: t('brands'), workProgram: t('workProgram'),
        partName: t('partName'), stitch: t('stitch'), stitchType: t('stitchType'),
        oneRs: t('oneRs'), stitchRate: t('stitchRate'), oneMP: t('oneMP'), meterPerPcs: t('meterPerPcs'),
        rate: t('rate'), total: t('total'), fabricName: t('fabricName'), fabricMeter: t('fabricMeter'),
        grandTotal: t('grandTotal'), totalFM: t('totalFM'), fabricProgram: t('fabricProgram'),
        grandFabricTotal: t('grandFabricTotal'), poweredBy: t('poweredBy'),
        meter: t('meter'), piece: t('piece'), voiceNote: t('voiceNote'),
      };
      openPrintWindow(program, matchings, parts, L, qrDataUrl);
      onClose();
    })();
  }, [programId, onClose, t]);

  if (loading) return <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)', color: T.tx }}>{t('loading')}</div>;
  return null;
}

function openPrintWindow(p: Program, matchings: ProgramMatching[], parts: ProgramPricePart[], L: Record<string, string>, qrDataUrl?: string) {
  const esc = (s: string | null) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const imageUrl = p.dropbox_gdrive_link ? toDirectImageUrl(p.dropbox_gdrive_link) : '';
  let html = '';
  const typeLabel = (v: string) => v === 'piece' ? L.piece : L.meter;
  const n = (v: number | null) => Number(v || 0);
  const showNum = (v: number | null, decimals = 2) => { const x = n(v); return x ? x.toFixed(decimals) : '—'; };
  const showRupee = (v: number | null) => { const x = n(v); return x ? '₹' + x.toFixed(2) : '—'; };

  html = `<!doctype html><html><head><meta charset="utf-8"><title>${L.programReport} ${esc(p.program_uid)}</title>
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
    </div>`;

  if (imageUrl) html +=`<div style="margin:12px 0"><img src="${esc(imageUrl)}" style="max-width:100%;max-height:200px;border:1px solid #ddd;border-radius:4px" onerror="this.style.display='none'"/></div>`;
  if (matchings.length > 0) {
    html +=`<h2>${esc(L.brands)} (${matchings.length})</h2><div>`;
    matchings.forEach(m => { html +=`<span class="pill">${esc(m.company_name)}${m.matching_label ? ' · ' + esc(m.matching_label) : ''}</span> `; });
    html +='</div>';
  }


  if (parts.length > 0) {
    const workParts = parts.filter(pt => (pt.section || 'work') === 'work');
    const fabricPartsList = parts.filter(pt => pt.section === 'fabric');
    const grandTotal = workParts.reduce((s, pt) => s + Number(pt.total || 0), 0);
    if (workParts.length > 0) {
      html +=`<h2>${esc(L.workProgram)}</h2><table><thead><tr><th>${esc(L.partName)}</th><th class="right">${esc(L.stitch)}</th><th>${esc(L.stitchType)}</th><th class="right">${esc(L.oneRs)}</th><th class="right">${esc(L.stitchRate)}</th><th class="right">${esc(L.oneMP)}</th><th class="right">${esc(L.meterPerPcs)}</th><th class="right">${esc(L.rate)}</th><th class="right">${esc(L.total)}</th><th>${esc(L.fabricName)}</th><th class="right">${esc(L.fabricMeter)}</th></tr></thead><tbody>`;
      workParts.forEach(pt => {
        const s = n(pt.stitch), mp = n(pt.one_mp);
        html +=`<tr><td>${esc(pt.part_name) || '—'}</td><td class="right">${s || '—'}</td><td>${esc(typeLabel(pt.stitch_type))}</td><td class="right">${showNum(pt.one_rs)}</td><td class="right">${showNum(pt.stitch_rate)}</td><td class="right">${mp || '—'}</td><td class="right">${showNum(pt.meter_per_pcs)}</td><td class="right">${showNum(pt.rate)}</td><td class="right">${showRupee(pt.total)}</td><td>${esc(pt.fabric_name) || '—'}</td><td class="right">${showNum(pt.fabric_meter)}</td></tr>`;
      });
      html +=`<tr class="total-row"><td colspan="8" style="text-align:right">${esc(L.grandTotal)}</td><td class="right">${grandTotal ? '₹' + grandTotal.toFixed(2) : '—'}</td><td style="text-align:right">${esc(L.totalFM)}</td><td class="right">${workParts.reduce((s, pt) => s + Number(pt.fabric_meter || 0), 0).toFixed(2)}</td></tr></tbody></table>`;
    }
    if (fabricPartsList.length > 0) {
      const fabricTotal = fabricPartsList.reduce((s, pt) => s + Number(pt.fabric_meter || 0), 0);
      html +=`<h2>${esc(L.fabricProgram)}</h2><table><thead><tr><th>${esc(L.partName)}</th><th class="right">${esc(L.fabricMeter)}</th></tr></thead><tbody>`;
      fabricPartsList.forEach(pt => { html +=`<tr><td>${esc(pt.part_name) || '—'}</td><td class="right">${showNum(pt.fabric_meter)}</td></tr>`; });
      html +=`<tr class="total-row"><td style="text-align:right">${esc(L.grandTotal)}</td><td class="right">${fabricTotal.toFixed(2)}</td></tr></tbody></table>`;
      const grandFabric = workParts.reduce((s, pt) => s + Number(pt.fabric_meter || 0), 0) + fabricTotal;
      html +=`<p style="text-align:right;font-weight:700;color:#0066cc">${esc(L.grandFabricTotal)}: ${grandFabric.toFixed(2)} m</p>`;
    }
  }
  if (qrDataUrl) {
    html +=`<div style="margin:16px 0;text-align:center;border-top:1px solid #eee;padding-top:12px"><p style="font-size:9px;color:#888;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px">${esc(L.voiceNote)} — Scan QR</p><img src="${qrDataUrl}" style="width:120px;height:120px" /></div>`;
  }
  html +=`<div class="footer">${esc(L.poweredBy)}</div></body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
  document.body.appendChild(iframe);
  const iw = iframe.contentWindow;
  if (!iw) { iframe.remove(); return; }
  iw.document.write(html);
  iw.document.close();
  setTimeout(() => { iw.print(); setTimeout(() => iframe.remove(), 1000); }, 300);
}

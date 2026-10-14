// Excel export for Buyer Spider leads — same workbook conventions as the
// Client Finder export (exportHits.ts): numbers stay numbers, widths set.
import * as XLSX from 'xlsx';
import { saveWorkbook } from '../../../../lib/xlsxDownload';
import { exportName, fileDate } from '../../../../lib/exportName';
import { KIND_LABEL, STATUS_LABEL, type BuyerLead } from './buyerApi';

export function exportLeadsXlsx(leads: BuyerLead[], subject: string): void {
  const header = ['Business', 'Website', 'Kind', 'City', 'Country', 'Sells', 'Email', 'Phone', 'WhatsApp', 'Instagram', 'Facebook', 'Match score', 'Why', 'Status', 'Notes', 'Found via', 'Hop', 'Found on'];
  const rows = leads.map(l => [
    l.name || l.domain, l.url, KIND_LABEL[l.kind || ''] || l.kind || '', l.city || '', l.country || '', l.what_they_sell || '',
    l.email || '', l.phone || '', l.whatsapp || '', l.instagram ? `https://instagram.com/${l.instagram}` : '', l.facebook ? `https://facebook.com/${l.facebook}` : '',
    l.score, l.reason || '', STATUS_LABEL[l.status], l.notes || '', l.parent_domain || '', l.hop, l.created_at.slice(0, 10),
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [28, 40, 14, 16, 14, 40, 28, 16, 16, 30, 30, 10, 50, 12, 30, 24, 5, 12].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, 'Buyers');
  saveWorkbook(wb, exportName('Buyers', [subject, fileDate()], 'xlsx'));
}

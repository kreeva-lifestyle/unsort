// "Report a problem": what a report carries and where it goes
// (issue_reports + the private issue-reports bucket). A scheduled Claude Code
// session reads new reports twice a day and opens a fix as a PR; nothing goes
// live until an admin approves it in Settings → Problem reports.
import { supabase } from '../../lib/supabase';
import { recentErrors } from '../../lib/recentErrors';

declare const __APP_BUILD__: string;   // injected by vite define (build stamp)

import type { IssueReport, ReportKind, ReportStatus } from '../../types/issueReports';
export type { IssueReport, ReportKind, ReportStatus };
export const REPORT_COLS = 'id, created_at, reporter_name, kind, note, page, screenshot_path, status, summary, pr_url, admin_note, updated_at';

export const KINDS: { id: ReportKind; label: string }[] = [
  { id: 'broken', label: 'Not working' }, { id: 'error', label: 'Error message' },
  { id: 'looks_wrong', label: 'Looks wrong / hard to use' }, { id: 'slow', label: 'Too slow' }, { id: 'idea', label: 'Idea' },
];
export const STATUS_LABEL: Record<ReportStatus, string> = {
  new: 'Sent', working: 'Being looked at', fix_ready: 'Fix ready — waiting for approval', approved: 'Approved — going live soon',
  fixed: 'Fixed', declined: 'Not changed', not_a_bug: 'Works as intended', needs_info: 'Needs more detail', duplicate: 'Already reported',
};

/**
 * What was on screen when the button was tapped, taken before the report
 * sheet opens: the page, its visible text (phone numbers and e-mails
 * masked), the device, and the last error messages shown.
 */
export function snapshotPage() {
  const root = document.querySelector('main') || document.body;
  const text = (root as HTMLElement).innerText || '';
  const page_text = text.replace(/\s*\n\s*/g, '\n').replace(/\b\d{10,12}\b/g, '[phone]').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').slice(0, 6000);
  return {
    page: `${document.title} (${location.hash || '#/'})`.slice(0, 300),
    page_text,
    context: {
      build: typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev',
      viewport: `${window.innerWidth}x${window.innerHeight}`, ua: navigator.userAgent.slice(0, 300), online: navigator.onLine,
      errors: recentErrors(),
    },
  };
}
export type PageSnapshot = ReturnType<typeof snapshotPage>;

/** A phone photo shrunk to at most 1280 px wide JPEG (keeps uploads small on mobile data). */
async function shrink(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / img.width);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('Could not read the picture'))), 'image/jpeg', 0.72));
  } catch { return file; }
}

export async function sendReport(snap: PageSnapshot, kind: ReportKind, note: string, picture: File | null, reporterName: string | null): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in again to send a report');
  const id = crypto.randomUUID();
  let screenshot_path: string | null = null;
  if (picture) {
    const blob = await shrink(picture);
    screenshot_path = `${user.id}/${id}.${blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
    const up = await supabase.storage.from('issue-reports').upload(screenshot_path, blob, { contentType: blob.type || 'image/jpeg' });
    if (up.error) throw up.error;
  }
  const { error } = await supabase.from('issue_reports').insert({ id, kind, note: note.trim().slice(0, 2000) || null, reporter_name: reporterName, screenshot_path, ...snap });
  if (error) throw error;
}

export async function myReports(): Promise<IssueReport[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from('issue_reports').select(REPORT_COLS).eq('created_by', user.id).order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return (data || []) as IssueReport[];
}

/** Admin: reports by status group, newest first. */
export async function allReports(open: boolean, page: number, size: number) {
  const q = supabase.from('issue_reports').select(REPORT_COLS, { count: 'exact' });
  const done = '(fixed,declined,not_a_bug,duplicate)';
  const { data, error, count } = await (open ? q.not('status', 'in', done) : q.in('status', ['fixed', 'declined', 'not_a_bug', 'duplicate']))
    .order('created_at', { ascending: false }).range(page * size, page * size + size - 1);
  if (error) throw error;
  return { rows: (data || []) as IssueReport[], total: count || 0 };
}

/** Admin: approve a ready fix (the next run merges it), or decline it. */
export async function decide(id: string, status: 'approved' | 'declined', adminNote: string) {
  const { data, error } = await supabase.from('issue_reports').update({ status, admin_note: adminNote.trim() || null }).eq('id', id).eq('status', 'fix_ready').select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('This report changed meanwhile — refresh and try again');
}

export async function screenshotUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('issue-reports').createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

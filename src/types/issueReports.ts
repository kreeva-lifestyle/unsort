// issue_reports — "Report a problem" (migration 20261020151536). Written by
// staff (insert own, status 'new'); read own / admin; admin approves a ready
// fix; the scheduled Claude Code check (docs/PROBLEM-REPORTS.md) fills
// summary / pr_url and moves the status. Re-exported from database.ts.
export type ReportKind = 'broken' | 'looks_wrong' | 'slow' | 'error' | 'idea';
export type ReportStatus = 'new' | 'working' | 'fix_ready' | 'approved' | 'fixed' | 'declined' | 'not_a_bug' | 'needs_info' | 'duplicate';

/** The columns the app reads (page_text and context are for the check only). */
export interface IssueReport {
  id: string;
  created_at: string;
  reporter_name: string | null;
  kind: ReportKind;
  note: string | null;
  page: string | null;
  screenshot_path: string | null;
  status: ReportStatus;
  summary: string | null;
  pr_url: string | null;
  admin_note: string | null;
  updated_at: string;
}

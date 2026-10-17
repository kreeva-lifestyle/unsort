// Pack Cam: one packing video per PackStation scan, recorded by the agent on
// the office PC (tools/packcam-agent). Re-exported from database.ts.

export type PackcamClipStatus = 'queued' | 'cutting' | 'uploading' | 'done' | 'failed' | 'missing' | 'deleted';

// ─── packcam_clips (22 cols) — written only by the packcam edge function ──
export interface PackcamClip {
  id: string;
  scan_id: string | null;
  awb: string;
  courier: string | null;
  camera: string;
  scanned_at: string;
  clip_start: string | null;
  clip_end: string | null;
  duration_s: number | null;
  size_bytes: number | null;
  status: PackcamClipStatus;
  pc_path: string | null;
  dropbox_path: string | null;
  gdrive_file_id: string | null;
  gdrive_link: string | null;
  error: string | null;
  delete_requested_at: string | null;
  delete_requested_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** app_settings.packcam — what the agent does. Admin edits it in Settings → Pack Cam. */
export interface PackcamSettings {
  enabled: boolean;
  targets: { pc: boolean; dropbox: boolean; gdrive: boolean };
  dropbox_folder: string;
  gdrive_folder_name: string;
  max_clip_seconds: number;
  pre_roll_seconds: number;
  post_roll_seconds: number;
  buffer_hours: number;
  auto_delete_days: number;
}

export const PACKCAM_DEFAULTS: PackcamSettings = {
  enabled: false,
  targets: { pc: true, dropbox: false, gdrive: false },
  dropbox_folder: '/PackCam',
  gdrive_folder_name: 'PackCam',
  max_clip_seconds: 600,
  pre_roll_seconds: 5,
  post_roll_seconds: 3,
  buffer_hours: 6,
  auto_delete_days: 0,
};

/** app_settings.packcam_agent — the PC's heartbeat (written by the edge function). */
export interface PackcamAgentStatus {
  last_seen?: string;
  version?: string;
  host?: string;
  os?: string;
  lan_url?: string;
  enabled?: boolean;
  disk?: { free_gb: number | null; total_gb: number | null };
  buffer_gb?: number;
  cameras?: { number: string; ok: boolean; last_segment_at: string | null; error: string | null }[];
  queue?: { waiting: number; failed: number };
  dropbox?: { ok: boolean; error?: string } | null;
  gdrive?: { configured: boolean; connected: boolean; connected_at: string | null } | null;
  last_error?: string | null;
}

/** packcam play → where to watch a clip. */
export interface PackcamPlay { url: string; source: 'dropbox' | 'gdrive' | 'pc'; external?: boolean; lan_only?: boolean }

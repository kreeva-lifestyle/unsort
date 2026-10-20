// Pack Cam: one packing video per PackStation scan, recorded by the agent on
// the office PC (tools/packcam-agent). Re-exported from database.ts.

// removed: the PC copy was moved or deleted by hand and no Dropbox / Drive copy is left.
export type PackcamClipStatus = 'queued' | 'cutting' | 'uploading' | 'done' | 'failed' | 'missing' | 'removed';

// ─── packcam_clips (18 cols) — written only by the packcam edge function ──
// Pack Cam never deletes clips; the team clears old ones from the PC folder,
// Dropbox or Drive themselves (the row then simply stops playing).
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
  created_at: string;
  updated_at: string;
}

/** app_settings.packcam — what the agent does. Admin edits it in Settings → Pack Cam. */
export interface PackcamSettings {
  enabled: boolean;
  targets: { pc: boolean; dropbox: boolean; gdrive: boolean };
  /** Folder on the office PC ('' = the agent's own clips folder). */
  pc_folder: string;
  dropbox_folder: string;
  gdrive_folder_name: string;
  max_clip_seconds: number;
  pre_roll_seconds: number;
  post_roll_seconds: number;
  buffer_hours: number;
  /** When Pack Cam was switched on/off (newest last, ~20 kept): explains "no video" for older scans. */
  enabled_log?: { at: string; on: boolean; by?: string }[];
  /** Settings → Cameras → Test connection: a new value (press time, ms) asks the PC to test every camera. */
  test_nonce?: string;
}

export const PACKCAM_DEFAULTS: PackcamSettings = {
  enabled: false,
  targets: { pc: true, dropbox: false, gdrive: false },
  pc_folder: '',
  dropbox_folder: '/PackCam',
  gdrive_folder_name: 'PackCam',
  max_clip_seconds: 600,
  pre_roll_seconds: 5,
  post_roll_seconds: 3,
  buffer_hours: 6,
};

/** app_settings.packcam_agent — the PC's heartbeat (written by the edge function). */
export interface PackcamAgentStatus {
  last_seen?: string;
  version?: string;
  host?: string;
  os?: string;
  lan_url?: string;
  /** The PC folder clips are actually saved in right now. */
  pc_folder?: string;
  enabled?: boolean;
  disk?: { free_gb: number | null; total_gb: number | null };
  buffer_gb?: number;
  cameras?: { number: string; ok: boolean; last_segment_at: string | null; error: string | null }[];
  queue?: { waiting: number; failed: number };
  dropbox?: { ok: boolean; error?: string } | null;
  /** upload_error (agent 1.4.0+): the last upload to Drive failed. */
  gdrive?: { configured: boolean; connected: boolean; connected_at: string | null; upload_error?: string | null } | null;
  last_error?: string | null;
  /** Agent 1.4.0+: room left where videos go (levels: ok · low < 7 days or 5 GB · full < 1 day or 1 GB). */
  storage?: Partial<Record<PackcamPlace, PackcamSpace>> & { per_day_gb?: number };
  /** Agent 1.4.0+: answers to Test connection, by camera number. */
  tests?: Record<string, { nonce: string; ok: boolean; message: string; at?: string }>;
}

export type PackcamPlace = 'recording' | 'pc' | 'dropbox' | 'gdrive';
export interface PackcamSpace { level: 'ok' | 'low' | 'full'; free_gb?: number | null; total_gb?: number | null; days?: number | null; checking?: boolean; error?: string }

/** packcam play → where to watch a clip. */
export interface PackcamPlay { url: string; source: 'dropbox' | 'gdrive' | 'pc'; external?: boolean; lan_only?: boolean }

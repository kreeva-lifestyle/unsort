// PackStation tables (packtime_cameras, packtime_couriers, packtime_scans,
// packtime_shortcuts). Split out of database.ts, which re-exports everything
// here — import from either.
// ─── packtime_cameras (8 cols) ───────────────────────────────────────────
// ip / rtsp_port / rtsp_path / username: how the Pack Cam agent reaches the
// camera (Settings → Pack Cam). The password is in packcam_camera_secrets,
// which no browser can read.

export interface PackTimeCamera {
  id: string;
  number: string;
  is_active: boolean | null;
  created_at: string | null;
  ip: string | null;
  rtsp_port: number;
  rtsp_path: string;
  username: string;
}

export type PackTimeCameraInsert = {
  id?: string;
  number: string;
  is_active?: boolean | null;
  created_at?: string | null;
  ip?: string | null;
  rtsp_port?: number;
  rtsp_path?: string;
  username?: string;
};

// ─── packtime_couriers (6 cols) ──────────────────────────────────────────

export interface PackTimeCourier {
  id: string;
  name: string;
  sheet_name: string;
  is_active: boolean | null;
  created_at: string | null;
  brand: string | null;
}

export type PackTimeCourierInsert = {
  id?: string;
  name: string;
  sheet_name: string;
  is_active?: boolean | null;
  created_at?: string | null;
  brand?: string | null;
};

// ─── packtime_scans (9 cols) ─────────────────────────────────────────────

export interface PackTimeScan {
  id: string;
  session_id: string;
  awb: string;
  courier: string;
  camera: string;
  sheet_name: string;
  scanned_at: string | null;
  user_id: string | null;
  brand: string | null;
  /** When the server got it (≠ scanned_at for a scan sent late from an offline phone). */
  received_at?: string;
  queued_ms?: number | null;
}

export type PackTimeScanInsert = {
  id?: string;
  session_id: string;
  awb: string;
  courier: string;
  camera: string;
  sheet_name: string;
  scanned_at?: string | null;
  user_id?: string | null;
  brand?: string | null;
  /** How long the scan waited on the phone before it was sent (ms): the server sets scanned_at = now − this. */
  queued_ms?: number | null;
};

// ─── packtime_shortcuts (6 cols) ────────────────────────────────────────

export interface PackTimeShortcut {
  id: string;
  user_id: string;
  courier: string;
  camera: string;
  brand: string;
  used_at: string;
}

export type PackTimeShortcutInsert = {
  id?: string;
  user_id: string;
  courier: string;
  camera: string;
  brand: string;
  used_at?: string;
};

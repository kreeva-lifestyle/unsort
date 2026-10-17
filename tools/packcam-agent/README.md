# Pack Cam agent

Records the packing-table IP cameras on the office PC and saves one video
per PackStation scan: **from the scan to the next scan on the same camera**
(plus a few seconds either side, never longer than the max clip length).
The video is copied exactly as the camera sends it; nothing is re-encoded and
quality is not lowered. Clips go to the PC, Dropbox and/or Google Drive, whichever
are switched on in DailyOffice → Settings → Pack Cam. Deleting clips (one, a
selection, or a date range) is done from the same page; this agent carries
the deletes out on every copy.

## How it works

```
cameras ──RTSP──▶ ffmpeg (one per camera) ──▶ segments/cam<N>/  (1-minute pieces, last N hours)
PackStation scan ──▶ packcam function ──▶ agent ──▶ clip cut from the pieces ──▶ PC / Dropbox / Drive
```

* Each camera records continuously into one-minute pieces; pieces older
  than the buffer (default 6 hours) are removed.
* For each scan the agent waits for the next scan on that camera (or the
  max length), then copies that stretch into `clips/<date>/<AWB>_cam<N>_<time>.mp4`.
* Clip status, size and storage places are reported back to DailyOffice.
* **Play** in DailyOffice opens the Dropbox copy, the Drive copy, or (for
  PC-only clips) a signed one-hour link to this PC that works on the office
  network.

## Setup on the office PC (Windows)

1. **Install Node.js** (LTS, version 20 or newer) from nodejs.org.
2. **Install ffmpeg**: open PowerShell and run `winget install Gyan.FFmpeg`
   (or download it from gyan.dev and note the path to `ffmpeg.exe`).
3. Put this folder on the PC, e.g. `C:\PackCam\agent`.
4. Copy `config.example.json` to `config.json`.
5. In DailyOffice → Settings → Pack Cam press **Create agent key** and paste
   it into `"agent_key"` in `config.json`. If ffmpeg is not on PATH, set
   `"ffmpeg"` to the full path, e.g. `C:/ffmpeg/bin/ffmpeg.exe`.
6. In Settings → Pack Cam → Cameras enter each camera's IP address, user name and
   password (Hikvision main stream: port 554, path `/Streaming/Channels/101`).
7. Double-click `start.bat`. Open <http://localhost:8765> on the PC: each
   camera should say **Recording**.
8. Run `install-startup.bat` once so Pack Cam starts when Windows signs in.
   Set the PC to sign in automatically and never sleep.
9. Allow Node.js through Windows Firewall on **Private** networks (Windows
   asks the first time) so PC-stored clips play on office phones and laptops.

### Google Drive (optional)

Drive needs a Google sign-in client of your own (free):

1. console.cloud.google.com → new project → *APIs & Services* → enable
   **Google Drive API**.
2. *OAuth consent screen*: External, add your e-mail, then **Publish app**
   (while it is in "Testing" Google signs the PC out every 7 days).
3. *Credentials* → *Create credentials* → *OAuth client ID* → type
   **Desktop app**. Put its client ID and secret into `config.json`
   (`gdrive_client_id`, `gdrive_client_secret`) and restart Pack Cam.
4. On the PC open <http://localhost:8765> → **Connect Google Drive**. Pack Cam can only see
   the files it creates (scope `drive.file`).

### Dropbox

Uses the Dropbox account already connected in DailyOffice (Minis → Dropbox);
nothing to set up on the PC.

## Camera tips

* Keep the camera clocks and the PC clock on automatic time (NTP). The agent
  corrects the PC clock against the server, but a camera's on-screen time
  should match too.
* H.265 on the main stream halves the storage for the same picture. Playback of
  H.265 depends on the viewer's browser or device; H.264 plays everywhere.

## Files

| Path (under `data_dir`) | What |
|---|---|
| `segments/cam<N>/` | rolling recording, pruned automatically |
| `clips/<date>/` | clips kept on the PC |
| `state.json` | progress of every clip (safe to keep across restarts) |
| `gdrive.json` | the Google Drive sign-in for this PC |
| `logs/packcam.log` | log, rolls over at 5 MB |

## Test

`npm test` runs the whole agent against a local stand-in server, with a video file as the
camera (needs ffmpeg/ffprobe on PATH).

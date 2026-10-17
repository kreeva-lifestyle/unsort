# Pack Cam agent

Records the packing-table IP cameras on the office PC and saves one video
per PackStation scan: **from the scan to the next scan on the same camera**
(plus a few seconds either side, never longer than the max clip length).
H.264 video is copied exactly as the camera sends it. H.265 (HEVC), which most
browsers and phones cannot play, is converted to H.264 once per clip on the PC
(x264 `veryfast`, CRF 23, at below-normal priority so recording is never slowed).
Clips go to the PC, Dropbox and/or Google Drive, whichever
are switched on in DailyOffice → Settings → Pack Cam. Pack Cam never deletes
a clip: clear old ones yourself from the PC folder, the Dropbox folder or the
Drive folder (one folder per day makes that easy). A removed clip simply stops
playing in DailyOffice.

## How it works

```
cameras ──RTSP──▶ ffmpeg (one per camera) ──▶ segments/cam<N>/  (1-minute pieces, last N hours)
PackStation scan ──▶ packcam function ──▶ agent ──▶ clip cut from the pieces ──▶ PC / Dropbox / Drive
```

* Each camera records continuously into one-minute pieces; pieces older
  than the buffer (default 6 hours) are removed.
* For each scan the agent waits for the next scan on that camera (or the
  max length), then copies that stretch into `<folder>/<date>/<tracking ID>.mp4`,
  e.g. `D:\Packing Videos\2026-10-17\SF4156451997AJI.mp4`. The same tracking ID
  twice on one day gets the scan time added (`SF4156451997AJI_143005.mp4`).
* The three folders (PC, Dropbox, Google Drive) are set in Settings → Pack Cam →
  Storage. A blank PC folder means `clips\` inside `data_dir`; a PC folder that
  cannot be used (drive missing) falls back to that and says so on the Status tab.
* Clip status, size and storage places are reported back to DailyOffice.
* **Play** in DailyOffice opens the Dropbox copy, the Drive copy, or (for
  PC-only clips) a signed one-hour link to this PC that works on the office
  network.

## Setup on the office PC (Windows)

The step-by-step guide with pictures ("Setup guide (PDF)") and the ready-to-unzip
program ("PC program (zip)") are in DailyOffice → Settings → Pack Cam → Status & setup.
In short:

1. In PowerShell: `winget install OpenJS.NodeJS.LTS` and `winget install Gyan.FFmpeg`,
   then restart the PC once.
2. Download "PC program (zip)" (`PackCam-PC-Setup.zip`: this folder plus a ready
   `config.json`, built from this folder on every deploy) and unzip it into
   `C:\PackCam`, giving `C:\PackCam\agent`. (From the code: copy this folder and
   copy `config.example.json` to `config.json`.)
3. In DailyOffice → Settings → Pack Cam press **Create agent key** and paste it
   into `"agent_key"` in `config.json`. If ffmpeg is not on PATH, set `"ffmpeg"`
   to the full path, e.g. `C:/ffmpeg/bin/ffmpeg.exe`.
4. Double-click `start.bat` and allow Node.js on **Private** networks when Windows
   asks (so PC-stored clips play on office phones). Open <http://localhost:8765>
   on the PC.
5. Right-click `install-startup.bat` → **Run as administrator**, once, so Pack Cam
   starts when Windows signs in. Set the PC to sign in automatically and never sleep.
6. In Settings → Pack Cam → Cameras enter each camera's IP address and password
   (Hikvision main stream: port 554, path `/Streaming/Channels/101`; behind an
   NVR use the NVR's IP and `/Streaming/Channels/<channel>01`). Then in Storage
   choose PC / Dropbox / Drive and their folders and turn recording on.

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
* H.264 on the camera is best: clips are a plain copy and cost the PC nothing.
  H.265 works too, but every clip is converted to H.264 on the PC. That costs
  CPU: on a 4-core PC about half a minute per minute of 4 MP video (1080p about
  half that). With several 4 MP H.265 cameras scanning all day an ordinary office
  PC can fall behind, so switch the cameras' main stream to H.264 if you can.
* A clip starts on the camera's keyframe just before the scan (a stream copy
  cannot start between keyframes), so the pre-roll can be up to one keyframe
  interval longer than set. Keep the camera's I-frame interval at 1–2 s.

## Updating

Download **PC program (zip)** again (always the latest), close the Pack Cam
window, replace the files in `C:\PackCam\agent` with the new ones but keep your
own `config.json` (it holds the agent key and settings), then run `start.bat`
again (or restart the PC). Clips cut before the update are not changed.

Only one Pack Cam runs per PC: a second `start.bat` (for example while the one
started at sign-in is running) says so and stops. `start.bat` never needs
administrator; only `install-startup.bat` does, once.

## Files

| Path (under `data_dir`) | What |
|---|---|
| `segments/cam<N>/` | rolling recording, pruned automatically |
| `clips/<date>/` | clips kept on the PC when no PC folder is set in Settings |
| `state.json` | progress of every clip (safe to keep across restarts) |
| `gdrive.json` | the Google Drive sign-in for this PC |
| `logs/packcam.log` | log, rolls over at 5 MB |

## Test

`npm test` runs the whole agent against a local stand-in server, with a video file as the
camera (needs ffmpeg/ffprobe on PATH).

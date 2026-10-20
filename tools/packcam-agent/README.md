# Pack Cam agent

Records the packing-table IP cameras on the office PC and saves one video
per PackStation scan: **from the scan to the next scan on the same camera**
(plus a few seconds either side). The whole video is never longer than the
"Longest video" setting: with no next scan it stops there.
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
2. Download "PC program (zip)" (`PackCam-PC-Setup.zip`: this folder, built on
   every deploy, with no `config.json` and no key) and unzip it into
   `C:\PackCam`, giving `C:\PackCam\agent`. Without a `config.json` the agent
   uses `config.example.json`; to change a setting (e.g. `"ffmpeg"` when ffmpeg is
   not on PATH: `C:/ffmpeg/bin/ffmpeg.exe`) copy it to `config.json` and edit that.
3. Double-click `start.bat` and allow Node.js on **Private** networks when Windows
   asks (so PC-stored clips play on office phones). With no key yet, Notepad opens
   `C:\PackCam\key.txt`: in DailyOffice → Settings → Pack Cam press **Create agent
   key**, paste it on the empty line, save (Ctrl+S) and close Notepad. Pack Cam
   starts by itself. Open <http://localhost:8765> on the PC and check each camera
   says Recording.
4. Right-click `install-startup.bat` → **Run as administrator**, once. It closes
   that window and from then on Pack Cam runs in the background with no window,
   starting by itself when Windows signs in (and right away). Set the PC to sign
   in automatically and never sleep.
5. In Settings → Pack Cam → Cameras enter each camera's IP address and password
   (Hikvision main stream: port 554, path `/Streaming/Channels/101`; behind an
   NVR use the NVR's IP and `/Streaming/Channels/<channel>01`) and press **Test
   connection**. Then in Storage choose PC / Dropbox / Drive and their folders,
   and turn Pack Cam on with the switch at the top of the page.

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

* A wrong user name or password: after 2 refusals Pack Cam stops trying that
  camera (cameras lock their login for ~30 minutes after repeated failures) and
  says so in plain words. Fix it in Settings → Pack Cam → Cameras and press
  **Test connection**: every camera is tried once and recording starts again.
* Free space: the PC reports how much room is left on its disk, in the videos
  folder, Dropbox and Google Drive (it asks Dropbox / Drive itself every 30
  minutes — nothing extra on the server), with a rough number of days at the
  current rate. Under 7 days or 5 GB shows as almost full, under 1 day or 1 GB
  as full, on the Pack Cam page and on the PackStation scan screen.
* Scans sent late by a phone that lost Wi-Fi keep their real scan time (the
  phone sends how long each one waited), so their videos are still right.
  If an earlier video was already cut over that time (it ran to the limit
  while the scans were stuck on the phone), it is cut again to end at the
  late scan, while its recording is still on the PC.
* Two packers on one camera: each video runs from a packer's scan to that
  same packer's next scan (not a colleague's), never past the limit.
* Long parcels: in the last 20 seconds of the countdown the packer can press
  **+30 s** (up to 10 minutes in all); the countdown beeps at 10 seconds left,
  ticks through the last 5 and sounds when the video stops.
* Dropbox / Drive show "Uploads failing" (not "Ready") while uploads fail.
* Videos moved or deleted from the PC folder by hand are noticed within 10
  minutes and show "Removed from PC" instead of "Saved" (a Dropbox / Drive copy
  still plays). A folder whose drive is unplugged is not counted.
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

Download **PC program (zip)** again (always the latest), double-click `stop.bat`,
extract the zip to `C:\PackCam` again and choose **Replace** (the zip has no
`config.json` and no key, so your settings and `C:\PackCam\key.txt` are kept;
a key still in an older `config.json` is moved to `key.txt` on the first start),
then right-click
`install-startup.bat` → **Run as administrator** (it also moves a PC set up
before 1.3.0 from the start.bat window to the background). Clips cut before the update are not changed.

## Running in the background

`start-hidden.vbs` runs Pack Cam with no window; the "Pack Cam" sign-in task
made by `install-startup.bat` (`install-startup.ps1`) runs it, without admin
rights and with no time limit, and double-clicking it starts Pack Cam by hand.
`stop.bat` (`stop.ps1`) stops it, any `start.bat` window and the camera
recorders: only processes of this folder (and ffmpeg writing into its data
folder), and it says so if something could not be stopped. `start.bat` is the
same thing with a window, for watching what it does. Only one Pack Cam runs per
PC: a second copy sees the web port taken and stops (`start-hidden.vbs` then
waits and takes over when the other one stops). On every start the agent also
stops ffmpeg recorders a crashed earlier copy may have left writing into its
segments folder, so a camera is never recorded twice. A start that fails at
once (Node.js not found) is written to
`startup-errors.log` next to the program and retried every minute. Only
`install-startup.bat` needs administrator.

## Files

| Path (under `data_dir`) | What |
|---|---|
| `segments/cam<N>/` | rolling recording, pruned automatically |
| `clips/<date>/` | clips kept on the PC when no PC folder is set in Settings |
| `state.json` | progress of every clip (safe to keep across restarts) |
| `key.txt` | the agent key (re-read on every check-in: a new key needs no restart) |
| `gdrive.json` | the Google Drive sign-in for this PC |
| `logs/packcam.log` | log, rolls over at 5 MB |

## Test

`npm test` runs the whole agent against a local stand-in server, with a video file as the
camera (needs ffmpeg/ffprobe on PATH).

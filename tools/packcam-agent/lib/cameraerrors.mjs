// Camera problems in words the owner can act on, instead of ffmpeg's
// ("method DESCRIBE failed: 401 Unauthorized"). Used for the recorder's
// status and for "Test connection".

// ffmpeg / ffprobe start the line with the camera address
// ("rtsp://***@1.2.3.4:554/Streaming/Channels/401: Connection timed out"):
// classify only what follows it, or NVR channel 4's path would read as a 401.
const core = msg => String(msg || '').replace(/^.*?rtsp:\/\/\S+:\s+/, '');

/** True when the camera refused the user name / password. */
export const isAuthError = msg => /\b401\b|unauthori[sz]ed|authentication|authorization failed/i.test(core(msg));

export function plainCameraError(msg, cam = {}) {
  const m = core(msg);
  const where = cam.ip ? ` at ${cam.ip}` : '';
  if (isAuthError(m)) return 'Wrong user name or password for this camera — correct it in Settings → Pack Cam → Cameras';
  if (/\b404\b|not found|\b454\b|session not found/i.test(m)) return 'The camera answered, but the stream path is wrong — try /Streaming/Channels/101 (Hikvision) or /stream1';
  if (/connection refused|error number -10061\b/i.test(m)) return `The camera${where} refused the connection — check the port (usually 554)`;
  // Windows: "Error number -138 occurred" is a timeout, -10060 / -10065 no answer.
  if (/timed? ?out|no route to host|network is unreachable|host is unreachable|could not resolve|name or service not known|error number -(138|10060|10065|10051)\b/i.test(m))
    return `Camera not reachable${where} — is it on and on the same network as the PC? Check the IP address`;
  if (/ENOENT|could not start|not recognized/i.test(m)) return 'ffmpeg is not installed on the office PC (see the setup guide, step "Install the two programs")';
  if (/\b5\d\d\b/.test(m)) return 'The camera reported an internal error — restart the camera';
  return m || 'No video from the camera';
}

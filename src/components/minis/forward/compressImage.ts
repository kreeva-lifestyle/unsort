// Compress a captured document photo entirely on the phone before upload:
// downscale so the long edge is ≤ maxEdge, re-encode as JPEG. Keeps files
// small and fast to send. (No shared helper existed — the RateCard renderer
// only composites; this adds the resize step.)

export interface Compressed { dataUrl: string; blob: Blob; kb: number }

// Draw an already-loaded source (a <canvas> or <img>/ImageBitmap) scaled to
// fit maxEdge onto a fresh canvas and encode it.
export async function compressCanvas(src: HTMLCanvasElement, maxEdge = 1600, quality = 0.72): Promise<Compressed> {
  const w = src.width, h = src.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const out = document.createElement('canvas');
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob>((res, rej) =>
    out.toBlob(b => b ? res(b) : rej(new Error('Could not process the photo — retake')), 'image/jpeg', quality));
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Could not read the photo — retake'));
    r.readAsDataURL(blob);
  });
  return { dataUrl, blob, kb: Math.round(blob.size / 1024) };
}

// Grab the current video frame at native resolution, then compress it.
export async function captureFrame(video: HTMLVideoElement, maxEdge = 1600, quality = 0.72): Promise<Compressed> {
  const grab = document.createElement('canvas');
  grab.width = video.videoWidth || 1280;
  grab.height = video.videoHeight || 720;
  grab.getContext('2d')!.drawImage(video, 0, 0, grab.width, grab.height);
  return compressCanvas(grab, maxEdge, quality);
}

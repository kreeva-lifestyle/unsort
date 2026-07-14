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

// Capture exactly what the user framed. The live preview uses `object-fit:
// cover`, so it shows a centre-crop of the sensor frame at the on-screen
// (usually portrait) aspect ratio. Grabbing the raw sensor frame instead gave a
// different aspect/orientation than the preview — the captured photo looked
// shifted/rotated on the review screen. Here we crop the sensor frame to the
// preview's visible region so the review matches the preview 1:1.
export async function captureFrame(video: HTMLVideoElement, maxEdge = 1600, quality = 0.72): Promise<Compressed> {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  // Displayed size of the <video> element (the framed viewport). Fall back to
  // the sensor frame if it hasn't laid out yet.
  const dw = video.clientWidth || vw;
  const dh = video.clientHeight || vh;
  const targetAspect = dw / dh;
  const frameAspect = vw / vh;
  let sx = 0, sy = 0, sWidth = vw, sHeight = vh;
  if (frameAspect > targetAspect) {          // sensor wider than viewport → crop the sides
    sWidth = Math.round(vh * targetAspect);
    sx = Math.round((vw - sWidth) / 2);
  } else {                                    // sensor taller than viewport → crop top/bottom
    sHeight = Math.round(vw / targetAspect);
    sy = Math.round((vh - sHeight) / 2);
  }
  const grab = document.createElement('canvas');
  grab.width = sWidth;
  grab.height = sHeight;
  grab.getContext('2d')!.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
  return compressCanvas(grab, maxEdge, quality);
}

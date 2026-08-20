// Costing photo optimizer: photos come off the phone at 3–8 MB; the sheet
// only needs a thumbnail-and-print-quality image. Resize to a 1200px long
// edge and re-encode as JPEG (~100–300 KB) BEFORE upload, so storage stays
// small and the list view loads fast. If the browser cannot decode the file
// (rare formats), fall back to the original — but never let a huge original
// through silently.
export const MAX_ORIGINAL = 4 * 1024 * 1024;

export async function optimizeImage(file: File): Promise<{ blob: Blob; type: string }> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (!blob) throw new Error('encode failed');
    return { blob, type: 'image/jpeg' };
  } catch {
    if (file.size > MAX_ORIGINAL) {
      throw new Error('That image could not be optimized and is too large to upload as-is (over 4 MB) — try a screenshot or a smaller photo.');
    }
    return { blob: file, type: file.type || 'image/jpeg' };
  }
}

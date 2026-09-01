// Hand a generated file (CSV, PNG…) to the user on any device.
//
// On phones, an <a download> click is a dead end inside the installed PWA
// (iOS silently drops it, or opens the CSV as a wall of text). The native
// share sheet is what people actually want there — WhatsApp, Files, Mail.
// Desktop browsers have no file share, so they get the plain download.
//
// Resolves true when the file was handed over, false when the user dismissed
// the share sheet. Throws on real failures so callers can toast friendlyError.
export async function downloadFile(blob: Blob, name: string): Promise<boolean> {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return false; // user closed the sheet
      // Any other share failure falls through to the download below.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

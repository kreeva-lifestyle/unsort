// Convert Dropbox/Google Drive share links to direct embeddable image URLs

export function toDirectImageUrl(url: string): string {
  if (!url) return '';
  // Dropbox: ?dl=0 → ?raw=1
  if (url.includes('dropbox.com')) {
    return url.replace(/\?dl=0$/, '?raw=1').replace(/&dl=0/, '&raw=1');
  }
  // Google Drive: extract file ID and convert to direct view URL
  const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  }
  // Already a direct URL
  return url;
}

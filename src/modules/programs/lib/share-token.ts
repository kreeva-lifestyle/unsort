// Share URL helpers for the public program view

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://dailyoffice.aryadesigns.co.in';

export function getShareUrl(shareToken: string): string {
  return `${BASE_URL}/#/share/program/${shareToken}`;
}

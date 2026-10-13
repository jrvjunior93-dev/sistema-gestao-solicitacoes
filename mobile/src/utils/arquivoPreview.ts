export type PreviewKind = 'image' | 'pdf' | 'document';

export function inferPreviewKind(...referencias: (string | null | undefined)[]): PreviewKind {
  if (referencias.some(ref => /\.pdf(?:[?#]|$)/i.test(ref || ''))) return 'pdf';
  if (referencias.some(ref => /\.(png|jpe?g|gif|webp|bmp|heic)(?:[?#]|$)/i.test(ref || ''))) return 'image';
  return 'document';
}

export function isPreviewUrlSafe(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

export const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export function fileUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return path;
  return `/${path}`;
}

export function getAuthToken() {
  const token = localStorage.getItem('token');
  if (!token || token === 'undefined') return null;
  return token;
}

export function authHeaders(extra = {}) {
  const token = getAuthToken();
  if (!token) return extra;
  return { ...extra, Authorization: `Bearer ${token}` };
}

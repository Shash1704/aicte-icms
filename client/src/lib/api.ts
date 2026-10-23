const TOKEN_KEY = 'icms.token';

/**
 * Demo mode (the GitHub Pages build): the server runs inside this browser tab, so API calls go
 * to the in-page server instead of the network. Everything else in the app is identical.
 */
export const DEMO = import.meta.env.MODE === 'demo';
type FetchInit = { method?: string; headers?: Record<string, string>; body?: BodyInit | null };
async function apiFetch(url: string, init: FetchInit = {}): Promise<Response> {
  if (DEMO) {
    const { demoFetch } = await import('../demo/server.js');
    return demoFetch(url, init);
  }
  return fetch(url, init);
}

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t: string | null) => {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const res = await apiFetch(`/api${path}`, { method: opts.method || (body ? 'POST' : 'GET'), headers, body });
  if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized?.();
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error || res.statusText);
  return data as T;
}

/** Query-string from an object, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

/** Authenticated file download (CSV exports, documents). */
export async function download(path: string, fallbackName = 'download') {
  const res = await apiFetch(`/api${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Open a case document in a new tab (fetched with the session token, so it works in both modes). */
export async function openDocument(id: number) {
  const win = window.open('', '_blank');
  const res = await apiFetch(`/api/documents/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) { win?.close(); throw new ApiError(res.status, 'Document not available'); }
  const url = URL.createObjectURL(await res.blob());
  if (win) win.location.href = url; else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

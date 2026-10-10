export class ApiError extends Error {
  status: number;
  details: any;
  constructor(status: number, message: string, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Fired whenever a staff (/api/admin) request is rejected as unauthenticated. */
export const SESSION_EXPIRED_EVENT = 'es:session-expired';

const BASE = (import.meta as any).env?.VITE_API_BASE ?? '';

/**
 * Staff session token. Kept in this page's own storage as a fallback for when the
 * browser withholds cookies (embedded previews). The httpOnly cookie is still set too.
 */
const TOKEN_KEY = 'es-staff-token';
/** In-memory copy: works for the whole page visit even when storage is blocked. */
let memoryToken: string | null = null;
export const staffToken = {
  get: (): string | null => {
    if (memoryToken) return memoryToken;
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    memoryToken = t;
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage blocked: the in-memory copy still carries this visit */
    }
  },
};

async function request<T>(method: string, path: string, body?: unknown, isForm?: boolean): Promise<T> {
  const headers: Record<string, string> = {};
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const token = path.startsWith('/api/admin') ? staffToken.get() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: Object.keys(headers).length ? headers : undefined,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    if (res.status === 401 && path.startsWith('/api/admin') && path !== '/api/admin/login') {
      staffToken.set(null);
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    const message = typeof data === 'object' && data?.error ? data.error : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, typeof data === 'object' ? data?.details : undefined);
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T = any>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T = any>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T = any>(path: string) => request<T>('DELETE', path),
  upload: <T = any>(path: string, form: FormData) => request<T>('POST', path, form, true),
};

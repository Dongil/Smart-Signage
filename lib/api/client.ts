// Design Ref: §1.2, §2.M4 — fetch wrapper with smart base URL detection.
//
// Base URL precedence:
//   1. Electron renderer    → invoke('get-server-info').baseUrl  (cached)
//   2. process.env.NEXT_PUBLIC_API_BASE (build-time override)
//   3. http(s)://<current-host>:7321  (LAN deployment)
//   4. http://localhost:7321 (browser dev fallback)

const DEFAULT_PORT = 7321;
let cachedBaseUrl: string | null = null;
let internalSecretPromise: Promise<string | null> | null = null;

async function detectBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;

  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      const info = (await window.electronAPI.invoke('get-server-info')) as
        | { baseUrl?: string | null }
        | null;
      if (info?.baseUrl) {
        cachedBaseUrl = info.baseUrl;
        return cachedBaseUrl;
      }
    } catch {
      // fall through
    }
  }

  const envBase = process.env.NEXT_PUBLIC_API_BASE;
  if (envBase) {
    cachedBaseUrl = envBase.replace(/\/$/, '');
    return cachedBaseUrl;
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    cachedBaseUrl = `${protocol}//${hostname}:${DEFAULT_PORT}`;
    return cachedBaseUrl;
  }

  cachedBaseUrl = `http://localhost:${DEFAULT_PORT}`;
  return cachedBaseUrl;
}

export function getApiBaseUrl(): Promise<string> {
  return detectBaseUrl();
}

export async function getInternalSecret(): Promise<string | null> {
  if (internalSecretPromise) return internalSecretPromise;
  if (typeof window === 'undefined' || !window.electronAPI) return null;
  internalSecretPromise = window.electronAPI
    .invoke('get-internal-secret')
    .then((v) => (typeof v === 'string' ? v : null))
    .catch(() => null);
  return internalSecretPromise;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** When true, the launch-time secret header is attached (Electron only). */
  internal?: boolean;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const base = await detectBaseUrl();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...opts.headers,
  };
  if (opts.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (opts.internal) {
    const secret = await getInternalSecret();
    if (secret) headers['X-Signage-Internal'] = secret;
  }

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    credentials: 'include',
  });

  let parsed: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const message =
      (parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : res.statusText) || `HTTP ${res.status}`;
    throw new ApiError(message, res.status, parsed);
  }

  return parsed as T;
}

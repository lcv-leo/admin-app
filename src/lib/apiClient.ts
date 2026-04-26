/**
 * Defensive API client foundation for admin-app frontend.
 *
 * Two helpers that future fetch sites SHOULD adopt:
 *
 * 1. `safeJson<T>(res)` — checks `Content-Type: application/json` before
 *    calling `res.json()`. When the proxy returns `text/plain "error code: 1101"`
 *    (Cloudflare uncaught-exception page) `safeJson` returns a structured
 *    failure object instead of throwing `SyntaxError: Unexpected token`.
 *    Same lesson as oraculo-financeiro v01.10.00.
 *
 * 2. `apiFetch(input, opts)` — wraps `fetch` with an `AbortController` +
 *    per-call timeout. Cloudflare proxy ceiling is 100s; client default
 *    is 90s for AI/Gemini calls and 15s for everything else.
 *
 * Migration: existing sites can opt-in incrementally. No bulk-rename
 * planned. Adding/migrating sites preserves prior functionality —
 * `apiFetch` only ABORTS after timeout, never silently changes response
 * semantics.
 */

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  status: number;
  statusText: string;
  contentType: string | null;
  error: string;
  bodyPreview: string;
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const PREVIEW_MAX = 500;

/**
 * Reads `res` defensively. Returns `{ ok: true, data }` only when the
 * response is `application/json`-typed AND parses cleanly. Otherwise
 * returns `{ ok: false, ... }` with a body preview for diagnostics.
 *
 * Does NOT throw on parse error — caller MUST inspect `.ok`.
 */
export async function safeJson<T = unknown>(res: Response): Promise<ApiResult<T>> {
  const contentType = res.headers.get('Content-Type');
  const isJson = !!contentType && /\bapplication\/json\b/i.test(contentType);

  if (!isJson) {
    let bodyPreview = '';
    try {
      bodyPreview = (await res.text()).slice(0, PREVIEW_MAX);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: res.status,
      statusText: res.statusText,
      contentType,
      error: `Resposta não é JSON (Content-Type: ${contentType ?? '<absent>'})`,
      bodyPreview,
    };
  }

  try {
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      status: res.status,
      statusText: res.statusText,
      contentType,
      error: err instanceof Error ? err.message : String(err),
      bodyPreview: '',
    };
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'signal'> {
  /** Per-call timeout in ms. Default 15000 (15s). For Gemini/AI calls, raise to 90000 (90s). */
  timeoutMs?: number;
  /** Abort signal from caller; merged with internal timeout signal. */
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Fetch wrapper with per-call AbortController + timeout. Long-running
 * calls (Gemini, bulk D1 ops) MUST opt-in to a higher timeout via
 * `timeoutMs`. Cloudflare proxy ceiling is 100s; staying under that
 * lets the client surface a clean abort instead of a 524.
 *
 * If caller provides their own `signal`, both signals are honored
 * (whichever aborts first wins).
 */
export async function apiFetch(input: RequestInfo | URL, opts: ApiFetchOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...rest } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let onCallerAbort: (() => void) | null = null;
  if (callerSignal) {
    if (callerSignal.aborted) ctrl.abort();
    else {
      onCallerAbort = () => ctrl.abort();
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  try {
    return await fetch(input, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    if (callerSignal && onCallerAbort) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
  }
}

/**
 * Combined helper: apiFetch + safeJson in one call. Returns `ApiResult<T>`.
 * Network/abort errors surface as `{ ok: false, status: 0, error: '...' }`.
 */
export async function apiFetchJson<T = unknown>(
  input: RequestInfo | URL,
  opts: ApiFetchOptions = {},
): Promise<ApiResult<T>> {
  try {
    const res = await apiFetch(input, opts);
    return safeJson<T>(res);
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      statusText: isAbort ? 'AbortError' : 'NetworkError',
      contentType: null,
      error: err instanceof Error ? err.message : String(err),
      bodyPreview: '',
    };
  }
}

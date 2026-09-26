import { useSessionStore } from "@/lib/store/session-store"

export type ApiErrorKind = "app" | "validation" | "network"

/**
 * Thrown for every non-2xx response and for fetch-level failures. The
 * backend emits two distinct error shapes on the wire (see
 * backend/app/errors.py):
 *
 *   - app errors:      { detail: { code, message, ...extras } }
 *   - validation (422): { detail: [ { type, loc, msg, input }, ... ] }
 *
 * `kind` discriminates between them (plus a client-side "network" kind for
 * when the fetch itself fails, e.g. the backend is unreachable on the LAN).
 * `code` is only ever set for `kind: "app"` -- match against it for specific
 * handling (e.g. "INSUFFICIENT_TENDER"). `detail` carries the raw parsed
 * value so callers can read extras the schema puts there (INSUFFICIENT_TENDER
 * carries `total`/`tendered`).
 */
export class ApiError extends Error {
  readonly status: number
  readonly kind: ApiErrorKind
  readonly code: string | null
  readonly detail: unknown

  constructor(opts: {
    status: number
    kind: ApiErrorKind
    code?: string | null
    message: string
    detail?: unknown
  }) {
    super(opts.message)
    this.name = "ApiError"
    this.status = opts.status
    this.kind = opts.kind
    this.code = opts.code ?? null
    this.detail = opts.detail
  }
}

// The string backend/main.py's health-check docstring anticipates for a
// dead/unreachable backend -- a LAN POS loses its server routinely, and every
// screen should say the same thing when that happens.
const UNREACHABLE_MESSAGE = "Tidak dapat menghubungi server kasir"

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown
  // Opt-in per call, matching the backend's exact four guarded routes
  // (backend/app/dependencies.py) rather than injecting the header blanket.
  withCashier?: boolean
}

function buildHeaders(opts: RequestOptions): Headers {
  const headers = new Headers(opts.headers)
  headers.set("Accept", "application/json")
  if (opts.body !== undefined) headers.set("Content-Type", "application/json")

  if (opts.withCashier) {
    const cashierId = useSessionStore.getState().cashierId
    if (!cashierId) {
      // Fail before the fetch with a clear code, rather than letting FastAPI
      // return a 422 for a header we know is missing.
      throw new ApiError({
        status: 0,
        kind: "app",
        code: "NO_SESSION",
        message: "Sesi kasir tidak ditemukan. Silakan masuk kembali.",
      })
    }
    headers.set("X-Cashier-Id", cashierId)
  }

  return headers
}

async function parseErrorBody(res: Response): Promise<{
  kind: ApiErrorKind
  code: string | null
  message: string
  detail: unknown
}> {
  const body = await res.json().catch(() => null)
  const detail = (body as { detail?: unknown } | null)?.detail

  if (Array.isArray(detail)) {
    // Pydantic/query validation errors -- English, low-level messages not
    // meant for the cashier to read verbatim.
    return {
      kind: "validation",
      code: null,
      message: "Data tidak valid",
      detail,
    }
  }
  if (detail && typeof detail === "object") {
    const d = detail as { code?: string; message?: string }
    return {
      kind: "app",
      code: d.code ?? null,
      message: d.message ?? `HTTP ${res.status}`,
      detail,
    }
  }
  return { kind: "app", code: null, message: `HTTP ${res.status}`, detail }
}

/**
 * The one fetch wrapper every lib/api/*.ts module goes through. `path` is
 * always relative and begins "/api/" -- the Next.js rewrite in
 * next.config.ts makes that same-origin in the browser, so there is no base
 * URL to configure client-side.
 */
export async function request<T>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const headers = buildHeaders(opts)

  let res: Response
  try {
    res = await fetch(path, {
      ...opts,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError({
      status: 0,
      kind: "network",
      message: UNREACHABLE_MESSAGE,
    })
  }

  if (!res.ok) {
    const parsed = await parseErrorBody(res)
    throw new ApiError({ status: res.status, ...parsed })
  }

  // DELETE /products/{id} and DELETE /open-sales/{id} return 204 with no
  // body. Note the asymmetry: DELETE /open-sales/{id}/lines/{lineId} returns
  // 200 WITH a body, so it goes through the normal json() path below.
  if (res.status === 204) return undefined as T

  return (await res.json()) as T
}

/** Builds a query string, dropping undefined/empty values so e.g. an empty
 * `q` never reaches /products/search (which requires min_length=1). */
export function qs(
  params: Record<string, string | number | boolean | undefined>
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue
    search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ""
}

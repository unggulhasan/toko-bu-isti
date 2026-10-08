import { request } from "@/lib/api/client"
import type { Cashier } from "@/lib/types"

export function login(
  pin: string
): Promise<{ cashier: Cashier; sessionToken: string }> {
  return request("/api/auth/login", { method: "POST", body: { pin } })
}

export function heartbeat(): Promise<void> {
  return request("/api/auth/heartbeat", { method: "POST", withCashier: true })
}

export function logout(): Promise<void> {
  return request("/api/auth/logout", { method: "POST", withCashier: true })
}

/**
 * Frees the PIN on the server so another register can use it right away.
 * Best-effort and fire-and-forget: if it fails (server unreachable) the
 * heartbeat timeout frees the PIN anyway. Call it BEFORE clearing the local
 * session -- the request reads the cashier id and token from the store
 * synchronously when it is called.
 */
export function releaseSession(): void {
  logout().catch(() => {})
}

import { request } from "@/lib/api/client"
import type { Cashier } from "@/lib/types"

export function login(pin: string): Promise<{ cashier: Cashier }> {
  return request("/api/auth/login", { method: "POST", body: { pin } })
}

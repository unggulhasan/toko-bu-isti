"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"

import { AppShell } from "@/components/pos/app-shell"
import { Toaster } from "@/components/ui/toast"
import { useIdleLogout } from "@/lib/hooks/use-idle-logout"
import { useSessionHeartbeat } from "@/lib/hooks/use-session-heartbeat"
import { useSessionHydrated, useSessionStore } from "@/lib/store/session-store"

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const hydrated = useSessionHydrated()
  const isLoggedIn = useSessionStore((state) => state.isLoggedIn)

  // Route protection is client-only by design (BACKEND_SPEC.md §1.4.7): there
  // is no middleware/proxy.ts. If that's ever added, Next 16 wants proxy.ts
  // exporting `proxy`, not middleware.ts (deprecated).
  useEffect(() => {
    if (hydrated && !isLoggedIn) {
      // Also covers sessions ended by lib/api/client.ts (PIN taken over by
      // another register): drop this cashier's cached carts and transactions.
      queryClient.clear()
      router.replace("/login")
    }
  }, [hydrated, isLoggedIn, queryClient, router])

  useIdleLogout()
  useSessionHeartbeat()

  if (!hydrated || !isLoggedIn) {
    return null
  }

  return (
    <Toaster>
      <AppShell>{children}</AppShell>
    </Toaster>
  )
}

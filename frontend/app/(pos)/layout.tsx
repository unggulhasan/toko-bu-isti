"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { AppShell } from "@/components/pos/app-shell"
import { Toaster } from "@/components/ui/toast"
import { useSessionHydrated, useSessionStore } from "@/lib/store/session-store"

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const hydrated = useSessionHydrated()
  const isLoggedIn = useSessionStore((state) => state.isLoggedIn)

  // Route protection is client-only by design (BACKEND_SPEC.md §1.4.7): there
  // is no middleware/proxy.ts. If that's ever added, Next 16 wants proxy.ts
  // exporting `proxy`, not middleware.ts (deprecated).
  useEffect(() => {
    if (hydrated && !isLoggedIn) {
      router.replace("/login")
    }
  }, [hydrated, isLoggedIn, router])

  if (!hydrated || !isLoggedIn) {
    return null
  }

  return (
    <Toaster>
      <AppShell>{children}</AppShell>
    </Toaster>
  )
}

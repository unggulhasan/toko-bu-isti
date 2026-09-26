"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { AppShell } from "@/components/pos/app-shell"
import { Toaster } from "@/components/ui/toast"
import { useSessionHydrated, useSessionStore } from "@/lib/store/session-store"

export default function PosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const hydrated = useSessionHydrated()
  const isLoggedIn = useSessionStore((state) => state.isLoggedIn)

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

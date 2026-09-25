"use client"

import { createContext, useContext, useMemo } from "react"

type SessionContextValue = {
  cashierName: string
  registerId: string
}

const SessionContext = createContext<SessionContextValue | null>(null)

const SESSION: SessionContextValue = {
  cashierName: "D. Lestari",
  registerId: "01",
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => SESSION, [])
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error("useSession must be used within SessionProvider")
  return ctx
}

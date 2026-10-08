import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { Cashier } from "@/lib/types"

type SessionState = {
  isLoggedIn: boolean
  cashierId: string
  cashierName: string
  // Proves this browser is the register that logged in; sent as
  // X-Session-Token. The server accepts only the latest login per PIN.
  sessionToken: string
  logoutReason: LogoutReason
}

// Why the session ended without the cashier asking. Not persisted: it only
// needs to survive the redirect to /login.
export type LogoutReason = "replaced" | null

type SessionActions = {
  // No `login` here on purpose: the store has no dependency on the API
  // module. The login page owns the useLogin() mutation and calls setSession
  // on success, which is what lets it tell "PIN salah" apart from "server
  // tidak terhubung" -- a distinction the mutation's ApiError.kind already
  // carries.
  setSession: (cashier: Cashier, sessionToken: string) => void
  logout: (reason?: LogoutReason) => void
}

const initialState: SessionState = {
  isLoggedIn: false,
  cashierId: "",
  cashierName: "",
  sessionToken: "",
  logoutReason: null,
}

export const useSessionStore = create<SessionState & SessionActions>()(
  persist(
    (set) => ({
      ...initialState,
      setSession: (cashier, sessionToken) => {
        set({
          isLoggedIn: true,
          cashierId: cashier.id,
          cashierName: cashier.name,
          sessionToken,
          logoutReason: null,
        })
      },
      logout: (reason = null) => {
        set({ ...initialState, logoutReason: reason })
      },
    }),
    {
      name: "pos:session",
      skipHydration: true,
      // v1 blobs (before cashierId existed) must not rehydrate as logged in --
      // every guarded mutation would 422 on a missing X-Cashier-Id header.
      // v2 blobs have no sessionToken, so the server would reject them too.
      version: 3,
      migrate: () => ({ ...initialState }),
      partialize: ({ isLoggedIn, cashierId, cashierName, sessionToken }) => ({
        isLoggedIn,
        cashierId,
        cashierName,
        sessionToken,
      }),
    }
  )
)

export function useSessionHydrated() {
  return useSyncExternalStore(
    (callback) => useSessionStore.persist.onFinishHydration(callback),
    () => useSessionStore.persist.hasHydrated(),
    () => false
  )
}

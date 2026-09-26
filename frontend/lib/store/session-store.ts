import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { Cashier } from "@/lib/types"

type SessionState = {
  isLoggedIn: boolean
  cashierId: string
  cashierName: string
}

type SessionActions = {
  // No `login` here on purpose: the store has no dependency on the API
  // module. The login page owns the useLogin() mutation and calls setSession
  // on success, which is what lets it tell "PIN salah" apart from "server
  // tidak terhubung" -- a distinction the mutation's ApiError.kind already
  // carries.
  setSession: (cashier: Cashier) => void
  logout: () => void
}

const initialState: SessionState = {
  isLoggedIn: false,
  cashierId: "",
  cashierName: "",
}

export const useSessionStore = create<SessionState & SessionActions>()(
  persist(
    (set) => ({
      ...initialState,
      setSession: (cashier) => {
        set({
          isLoggedIn: true,
          cashierId: cashier.id,
          cashierName: cashier.name,
        })
      },
      logout: () => {
        set({ ...initialState })
      },
    }),
    {
      name: "pos:session",
      skipHydration: true,
      // v1 blobs (before cashierId existed) must not rehydrate as logged in --
      // every guarded mutation would 422 on a missing X-Cashier-Id header.
      version: 2,
      migrate: () => ({ ...initialState }),
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

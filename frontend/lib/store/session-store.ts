import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"

const CASHIERS: Record<string, { cashierName: string }> = {
  "1234": { cashierName: "Kasir 1" },
  "7890": { cashierName: "Kasir 2" },
}

type SessionState = {
  isLoggedIn: boolean
  cashierName: string
}

type SessionActions = {
  login: (password: string) => boolean
  logout: () => void
}

export const useSessionStore = create<SessionState & SessionActions>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      cashierName: "",
      login: (password) => {
        const cashier = CASHIERS[password]
        if (!cashier) return false
        set({ isLoggedIn: true, ...cashier })
        return true
      },
      logout: () => {
        set({ isLoggedIn: false, cashierName: "" })
      },
    }),
    {
      name: "pos:session",
      skipHydration: true,
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

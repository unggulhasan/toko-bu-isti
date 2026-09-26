import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"

const CASHIERS: Record<string, { cashierName: string; registerId: string }> = {
  "1234": { cashierName: "Kasir 1", registerId: "01" },
  "7890": { cashierName: "Kasir 2", registerId: "02" },
}

type SessionState = {
  isLoggedIn: boolean
  cashierName: string
  registerId: string
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
      registerId: "",
      login: (password) => {
        const cashier = CASHIERS[password]
        if (!cashier) return false
        set({ isLoggedIn: true, ...cashier })
        return true
      },
      logout: () => {
        set({ isLoggedIn: false, cashierName: "", registerId: "" })
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

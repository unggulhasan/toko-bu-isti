import { create } from "zustand"

type SessionState = {
  cashierName: string
  registerId: string
}

export const useSessionStore = create<SessionState>(() => ({
  cashierName: "ShitaMira",
  registerId: "01",
}))

import { create } from "zustand"

// Client-only UI state that has no server equivalent -- deliberately NOT
// persisted. Everything else the old sales-store held (the cart contents,
// totals) now lives in the open-sales query cache; see lib/hooks/use-open-sales.ts
// and lib/hooks/use-active-sale.ts for the derivations (cycleActiveSale,
// moveSelection, activeSale()) that need the server list and so don't belong
// here.
type PosUiState = {
  activeSaleId: string | null
  selectedLineId: string | null
  justScannedLineId: string | null
}

type PosUiActions = {
  setActiveSaleId: (id: string | null) => void
  setSelectedLineId: (id: string | null) => void
  // Owns the flash-then-clear timer itself (unlike the old sales-store, which
  // scheduled a bare setTimeout with no way to cancel it -- rapid scanning
  // could cancel a previous highlight early). Re-flashing clears any pending
  // timer first.
  flashScannedLine: (id: string) => void
}

let flashTimer: ReturnType<typeof setTimeout> | null = null

export const usePosUiStore = create<PosUiState & PosUiActions>()((set) => ({
  activeSaleId: null,
  selectedLineId: null,
  justScannedLineId: null,

  setActiveSaleId: (id) => set({ activeSaleId: id, selectedLineId: null }),
  setSelectedLineId: (id) => set({ selectedLineId: id }),
  flashScannedLine: (id) => {
    if (flashTimer) clearTimeout(flashTimer)
    set({ justScannedLineId: id })
    flashTimer = setTimeout(() => set({ justScannedLineId: null }), 1500)
  },
}))

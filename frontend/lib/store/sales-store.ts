import { create } from "zustand"
import { persist } from "zustand/middleware"

import { SEED_OPEN_SALES } from "@/lib/data/seed-sales"
import type { OpenSale, Product } from "@/lib/types"

function makeEmptySale(): OpenSale {
  return {
    id: `s-${Date.now()}`,
    createdAt: new Date().toISOString(),
    lines: [],
  }
}

type SalesState = {
  sales: OpenSale[]
  activeSaleId: string
  justScannedLineId: string | null
  scanError: string | null
  selectedLineId: string | null
}

type SalesActions = {
  activeSale: () => OpenSale | undefined
  setSelectedLineId: (id: string | null) => void
  setActiveSaleId: (id: string) => void
  newSale: () => void
  cycleActiveSale: (direction: 1 | -1) => void
  moveSelection: (direction: 1 | -1) => void
  scanBarcode: (barcode: string, product: Product | undefined) => void
  setLineQty: (lineId: string, qty: number) => void
  removeLine: (lineId: string) => void
  removeActiveSale: () => void
  clearActiveSaleAfterPayment: () => void
}

export const useSalesStore = create<SalesState & SalesActions>()(
  persist(
    (set, get) => ({
      sales: SEED_OPEN_SALES,
      activeSaleId: SEED_OPEN_SALES[0]?.id ?? "",
      justScannedLineId: null,
      scanError: null,
      selectedLineId: null,

      activeSale: () => {
        const { sales, activeSaleId } = get()
        return sales.find((s) => s.id === activeSaleId)
      },

      setSelectedLineId: (id) => set({ selectedLineId: id }),

      setActiveSaleId: (id) => {
        set({ activeSaleId: id, selectedLineId: null })
      },

      newSale: () => {
        set((state) => {
          const sale = makeEmptySale()
          return {
            sales: [...state.sales, sale],
            activeSaleId: sale.id,
            selectedLineId: null,
          }
        })
      },

      cycleActiveSale: (direction) => {
        set((state) => {
          if (state.sales.length === 0) return state
          const currentIndex = state.sales.findIndex(
            (s) => s.id === state.activeSaleId
          )
          const nextIndex =
            (currentIndex + direction + state.sales.length) % state.sales.length
          return {
            activeSaleId: state.sales[nextIndex].id,
            selectedLineId: null,
          }
        })
      },

      moveSelection: (direction) => {
        set((state) => {
          const sale = state.sales.find((s) => s.id === state.activeSaleId)
          const lines = sale?.lines ?? []
          if (lines.length === 0) return state
          const currentIndex = lines.findIndex(
            (l) => l.id === state.selectedLineId
          )
          const nextIndex =
            currentIndex === -1
              ? direction === 1
                ? 0
                : lines.length - 1
              : Math.min(lines.length - 1, Math.max(0, currentIndex + direction))
          return { selectedLineId: lines[nextIndex].id }
        })
      },

      scanBarcode: (barcode, product) => {
        if (!product) {
          set({ scanError: `Barkode "${barcode}" tidak ditemukan` })
          return
        }
        set({ scanError: null })
        const { activeSaleId } = get()
        let scannedLineId: string | null = null
        set((state) => ({
          sales: state.sales.map((sale) => {
            if (sale.id !== activeSaleId) return sale
            const existing = sale.lines.find(
              (l) => l.barcode === product.barcode
            )
            if (existing) {
              scannedLineId = existing.id
              return {
                ...sale,
                lines: sale.lines.map((l) =>
                  l.id === existing.id ? { ...l, qty: l.qty + 1 } : l
                ),
              }
            }
            const newLine = {
              id: `l-${Date.now()}`,
              productId: product.id,
              barcode: product.barcode,
              name: product.name,
              price: product.price,
              qty: 1,
            }
            scannedLineId = newLine.id
            return { ...sale, lines: [...sale.lines, newLine] }
          }),
        }))
        set({ justScannedLineId: scannedLineId })
        setTimeout(() => set({ justScannedLineId: null }), 1500)
      },

      setLineQty: (lineId, qty) => {
        const { activeSaleId } = get()
        set((state) => ({
          sales: state.sales.map((sale) =>
            sale.id !== activeSaleId
              ? sale
              : {
                  ...sale,
                  lines:
                    qty <= 0
                      ? sale.lines.filter((l) => l.id !== lineId)
                      : sale.lines.map((l) =>
                          l.id === lineId ? { ...l, qty } : l
                        ),
                }
          ),
          selectedLineId: qty <= 0 ? null : state.selectedLineId,
        }))
      },

      removeLine: (lineId) => {
        const { activeSaleId } = get()
        set((state) => ({
          sales: state.sales.map((sale) =>
            sale.id !== activeSaleId
              ? sale
              : { ...sale, lines: sale.lines.filter((l) => l.id !== lineId) }
          ),
          selectedLineId:
            state.selectedLineId === lineId ? null : state.selectedLineId,
        }))
      },

      removeActiveSale: () => {
        set((state) => {
          const remaining = state.sales.filter(
            (s) => s.id !== state.activeSaleId
          )
          const next = remaining[0] ?? makeEmptySale()
          return {
            sales: remaining.length > 0 ? remaining : [next],
            activeSaleId: next.id,
            selectedLineId: null,
          }
        })
      },

      clearActiveSaleAfterPayment: () => {
        set((state) => {
          const remaining = state.sales.filter(
            (s) => s.id !== state.activeSaleId
          )
          const next = remaining[0] ?? makeEmptySale()
          return {
            sales: remaining.length > 0 ? remaining : [next],
            activeSaleId: next.id,
            selectedLineId: null,
          }
        })
      },
    }),
    {
      name: "pos:open-sales",
      skipHydration: true,
      partialize: (state) => ({
        sales: state.sales,
        activeSaleId: state.activeSaleId,
      }),
    }
  )
)

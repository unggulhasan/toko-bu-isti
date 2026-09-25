import { create } from "zustand"
import { persist } from "zustand/middleware"

import { SEED_OPEN_SALES } from "@/lib/data/seed-sales"
import type { OpenSale, Product } from "@/lib/types"

function nextSaleNumberFrom(sales: OpenSale[]): number {
  return Math.max(0, ...sales.map((s) => s.number)) + 1
}

function makeEmptySale(sales: OpenSale[]): OpenSale {
  const number = nextSaleNumberFrom(sales)
  return {
    id: `s-${number}`,
    number,
    status: "active",
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
  holdActiveSale: () => void
  cycleActiveSale: () => void
  jumpToSale: (index: number) => void
  scanBarcode: (barcode: string, product: Product | undefined) => void
  setLineQty: (lineId: string, qty: number) => void
  removeLine: (lineId: string) => void
  clearActiveSaleAfterPayment: () => void
}

export const useSalesStore = create<SalesState & SalesActions>()(
  persist(
    (set, get) => ({
      sales: SEED_OPEN_SALES,
      activeSaleId:
        SEED_OPEN_SALES.find((s) => s.status === "active")?.id ?? "",
      justScannedLineId: null,
      scanError: null,
      selectedLineId: null,

      activeSale: () => {
        const { sales, activeSaleId } = get()
        return sales.find((s) => s.id === activeSaleId)
      },

      setSelectedLineId: (id) => set({ selectedLineId: id }),

      setActiveSaleId: (id) => {
        set((state) => ({
          activeSaleId: id,
          sales: state.sales.map((s) =>
            s.id === id ? { ...s, status: "active" } : s
          ),
          selectedLineId: null,
        }))
      },

      newSale: () => {
        set((state) => {
          const sale = makeEmptySale(state.sales)
          return {
            sales: [...state.sales, sale],
            activeSaleId: sale.id,
            selectedLineId: null,
          }
        })
      },

      holdActiveSale: () => {
        set((state) => {
          const currentIndex = state.sales.findIndex(
            (s) => s.id === state.activeSaleId
          )
          const held = state.sales.map((s) =>
            s.id === state.activeSaleId ? { ...s, status: "waiting" as const } : s
          )
          const next = held.find(
            (s, i) => i !== currentIndex && s.status === "waiting"
          )
          return {
            sales: held,
            activeSaleId: next?.id ?? state.activeSaleId,
            selectedLineId: null,
          }
        })
      },

      cycleActiveSale: () => {
        set((state) => {
          if (state.sales.length === 0) return state
          const currentIndex = state.sales.findIndex(
            (s) => s.id === state.activeSaleId
          )
          const nextIndex = (currentIndex + 1) % state.sales.length
          return {
            activeSaleId: state.sales[nextIndex].id,
            selectedLineId: null,
          }
        })
      },

      jumpToSale: (index) => {
        set((state) => {
          const target = state.sales[index]
          if (!target) return state
          return { activeSaleId: target.id, selectedLineId: null }
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

      clearActiveSaleAfterPayment: () => {
        set((state) => {
          const remaining = state.sales.filter(
            (s) => s.id !== state.activeSaleId
          )
          const next = remaining[0] ?? makeEmptySale(remaining)
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

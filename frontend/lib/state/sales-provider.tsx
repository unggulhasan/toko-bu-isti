"use client"

import { createContext, useContext, useMemo, useState } from "react"

import { useLocalStorageState } from "@/hooks/use-local-storage-state"
import { SEED_OPEN_SALES } from "@/lib/data/seed-sales"
import type { OpenSale, Product } from "@/lib/types"

type SalesState = {
  sales: OpenSale[]
  activeSaleId: string
}

const INITIAL_STATE: SalesState = {
  sales: SEED_OPEN_SALES,
  activeSaleId: SEED_OPEN_SALES.find((s) => s.status === "active")?.id ?? "",
}

let nextSaleNumber =
  Math.max(0, ...SEED_OPEN_SALES.map((s) => s.number)) + 1

type SalesContextValue = {
  sales: OpenSale[]
  activeSale: OpenSale | undefined
  activeSaleId: string
  justScannedLineId: string | null
  scanError: string | null
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

const SalesContext = createContext<SalesContextValue | null>(null)

function makeEmptySale(): OpenSale {
  const sale: OpenSale = {
    id: `s-${nextSaleNumber}`,
    number: nextSaleNumber,
    status: "active",
    createdAt: new Date().toISOString(),
    lines: [],
  }
  nextSaleNumber += 1
  return sale
}

export function SalesProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useLocalStorageState<SalesState>(
    "pos:open-sales",
    INITIAL_STATE
  )
  const [justScannedLineId, setJustScannedLineId] = useState<string | null>(
    null
  )
  const [scanError, setScanError] = useState<string | null>(null)

  const activeSale = state.sales.find((s) => s.id === state.activeSaleId)

  const value = useMemo<SalesContextValue>(() => {
    function updateSale(id: string, updater: (sale: OpenSale) => OpenSale) {
      setState((prev) => ({
        ...prev,
        sales: prev.sales.map((s) => (s.id === id ? updater(s) : s)),
      }))
    }

    return {
      sales: state.sales,
      activeSale,
      activeSaleId: state.activeSaleId,
      justScannedLineId,
      scanError,
      setActiveSaleId: (id) => {
        setState((prev) => ({
          ...prev,
          activeSaleId: id,
          sales: prev.sales.map((s) =>
            s.id === id ? { ...s, status: "active" } : s
          ),
        }))
      },
      newSale: () => {
        const sale = makeEmptySale()
        setState((prev) => ({
          sales: [...prev.sales, sale],
          activeSaleId: sale.id,
        }))
      },
      holdActiveSale: () => {
        setState((prev) => {
          const currentIndex = prev.sales.findIndex(
            (s) => s.id === prev.activeSaleId
          )
          const held = prev.sales.map((s) =>
            s.id === prev.activeSaleId ? { ...s, status: "waiting" as const } : s
          )
          const next = held.find(
            (s, i) => i !== currentIndex && s.status === "waiting"
          )
          return {
            sales: held,
            activeSaleId: next?.id ?? prev.activeSaleId,
          }
        })
      },
      cycleActiveSale: () => {
        setState((prev) => {
          if (prev.sales.length === 0) return prev
          const currentIndex = prev.sales.findIndex(
            (s) => s.id === prev.activeSaleId
          )
          const nextIndex = (currentIndex + 1) % prev.sales.length
          return { ...prev, activeSaleId: prev.sales[nextIndex].id }
        })
      },
      jumpToSale: (index) => {
        setState((prev) => {
          const target = prev.sales[index]
          if (!target) return prev
          return { ...prev, activeSaleId: target.id }
        })
      },
      scanBarcode: (barcode, product) => {
        if (!product) {
          setScanError(`Barkode "${barcode}" tidak ditemukan`)
          return
        }
        setScanError(null)
        const saleId = state.activeSaleId
        let scannedLineId: string | null = null
        updateSale(saleId, (sale) => {
          const existing = sale.lines.find((l) => l.barcode === product.barcode)
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
        })
        setJustScannedLineId(scannedLineId)
        setTimeout(() => setJustScannedLineId(null), 1500)
      },
      setLineQty: (lineId, qty) => {
        updateSale(state.activeSaleId, (sale) => ({
          ...sale,
          lines:
            qty <= 0
              ? sale.lines.filter((l) => l.id !== lineId)
              : sale.lines.map((l) => (l.id === lineId ? { ...l, qty } : l)),
        }))
      },
      removeLine: (lineId) => {
        updateSale(state.activeSaleId, (sale) => ({
          ...sale,
          lines: sale.lines.filter((l) => l.id !== lineId),
        }))
      },
      clearActiveSaleAfterPayment: () => {
        setState((prev) => {
          const remaining = prev.sales.filter((s) => s.id !== prev.activeSaleId)
          const next = remaining[0] ?? makeEmptySale()
          return {
            sales: remaining.length > 0 ? remaining : [next],
            activeSaleId: next.id,
          }
        })
      },
    }
  }, [state, activeSale, justScannedLineId, scanError, setState])

  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>
}

export function useSales() {
  const ctx = useContext(SalesContext)
  if (!ctx) throw new Error("useSales must be used within SalesProvider")
  return ctx
}

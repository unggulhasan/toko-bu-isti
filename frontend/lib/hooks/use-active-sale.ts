import { useEffect } from "react"

import { useOpenSalesQuery } from "@/lib/hooks/use-open-sales"
import { usePosUiStore } from "@/lib/store/pos-ui-store"
import type { OpenSale } from "@/lib/types"

/**
 * Resolves pos-ui-store's activeSaleId against the live open-sales list.
 * activeSaleId may reference a sale that no longer exists (deleted from
 * another terminal, or consumed by checkout), so this falls back to the
 * first sale in the list and writes the corrected id back -- every consumer
 * of "the active sale" should go through this hook rather than reading
 * activeSaleId directly.
 */
export function useActiveSale(): {
  sale: OpenSale | undefined
  sales: OpenSale[]
  activeIndex: number
} {
  const { data: sales = [] } = useOpenSalesQuery()
  const activeSaleId = usePosUiStore((s) => s.activeSaleId)
  const setActiveSaleId = usePosUiStore((s) => s.setActiveSaleId)

  const activeIndex = sales.findIndex((s) => s.id === activeSaleId)
  const resolvedIndex = activeIndex === -1 && sales.length > 0 ? 0 : activeIndex
  const sale = resolvedIndex >= 0 ? sales[resolvedIndex] : undefined

  useEffect(() => {
    if (sale && sale.id !== activeSaleId) setActiveSaleId(sale.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale?.id, activeSaleId])

  return { sale, sales, activeIndex: resolvedIndex }
}

export function useCycleActiveSale() {
  const { sales, activeIndex } = useActiveSale()
  const setActiveSaleId = usePosUiStore((s) => s.setActiveSaleId)

  return (direction: 1 | -1) => {
    if (sales.length === 0) return
    const nextIndex = (activeIndex + direction + sales.length) % sales.length
    setActiveSaleId(sales[nextIndex].id)
  }
}

export function useMoveSelection() {
  const { sale } = useActiveSale()
  const selectedLineId = usePosUiStore((s) => s.selectedLineId)
  const setSelectedLineId = usePosUiStore((s) => s.setSelectedLineId)

  return (direction: 1 | -1) => {
    const lines = sale?.lines ?? []
    if (lines.length === 0) return
    const currentIndex = lines.findIndex((l) => l.id === selectedLineId)
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : lines.length - 1
        : Math.min(lines.length - 1, Math.max(0, currentIndex + direction))
    setSelectedLineId(lines[nextIndex].id)
  }
}

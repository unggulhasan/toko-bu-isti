import { useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as api from "@/lib/api/open-sales"
import { queryKeys } from "@/lib/api/query-keys"
import { usePosUiStore } from "@/lib/store/pos-ui-store"
import { useSessionStore } from "@/lib/store/session-store"
import type { OpenSale } from "@/lib/types"

/** Passive read of the open-sales list. Does not bootstrap -- safe to mount
 * in as many components as need the list (open-sales-strip, cart-table,
 * etc). See useOpenSales() below for the one component that also creates a
 * cart when the list is empty. */
export function useOpenSalesQuery() {
  const cashierId = useSessionStore((s) => s.cashierId)
  return useQuery({
    queryKey: queryKeys.openSales.list(cashierId),
    queryFn: api.listOpenSales,
    select: (data) => data.items,
    enabled: Boolean(cashierId),
  })
}

/**
 * The bootstrapping variant: GET /api/open-sales returns {items: []} and
 * NEVER auto-creates a cart (backend/app/routers/open_sales.py). Mount this
 * hook in exactly ONE place -- app/(pos)/page.tsx. Every other component
 * should use the passive useOpenSalesQuery() above.
 *
 * The useRef guard is required: without it, React strict-mode's double
 * invoke plus a refetchOnWindowFocus landing before the first POST resolves
 * would create two or three stray carts in the database.
 */
export function useOpenSales() {
  const query = useOpenSalesQuery()
  const create = useCreateOpenSale()
  const bootstrapping = useRef(false)

  useEffect(() => {
    if (query.isSuccess && query.data.length === 0 && !bootstrapping.current) {
      bootstrapping.current = true
      create.mutate(undefined, {
        onSettled: () => {
          bootstrapping.current = false
        },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isSuccess, query.data])

  return query
}

// Read at call time, not render time: mutation callbacks can outlive the render
// that created them, and must write to the list of whoever is signed in now.
function currentListKey() {
  return queryKeys.openSales.list(useSessionStore.getState().cashierId)
}

function replaceSaleInCache(
  qc: ReturnType<typeof useQueryClient>,
  sale: OpenSale
) {
  qc.setQueryData(
    currentListKey(),
    (old: { items: OpenSale[] } | undefined) => {
      if (!old) return old
      const exists = old.items.some((s) => s.id === sale.id)
      return {
        items: exists
          ? old.items.map((s) => (s.id === sale.id ? sale : s))
          : [...old.items, sale],
      }
    }
  )
}

export function useCreateOpenSale() {
  const qc = useQueryClient()
  const setActiveSaleId = usePosUiStore((s) => s.setActiveSaleId)
  return useMutation({
    mutationFn: api.createOpenSale,
    onSuccess: (sale) => {
      replaceSaleInCache(qc, sale)
      setActiveSaleId(sale.id)
    },
  })
}

export function useDeleteOpenSale() {
  const qc = useQueryClient()
  const setActiveSaleId = usePosUiStore((s) => s.setActiveSaleId)
  const create = useCreateOpenSale()
  return useMutation({
    mutationFn: (id: string) => api.deleteOpenSale(id),
    onSuccess: (_void, deletedId) => {
      const current = qc.getQueryData<{ items: OpenSale[] }>(currentListKey())
      const remaining = (current?.items ?? []).filter((s) => s.id !== deletedId)
      qc.setQueryData(currentListKey(), { items: remaining })
      // 204 returns no replacement cart -- pick the next one, or bootstrap a
      // fresh one if that was the last, in this one place rather than at
      // every call site.
      if (remaining.length > 0) {
        setActiveSaleId(remaining[0].id)
      } else {
        create.mutate()
      }
    },
  })
}

export function useScan() {
  const qc = useQueryClient()
  const flashScannedLine = usePosUiStore((s) => s.flashScannedLine)
  return useMutation({
    mutationFn: ({ saleId, barcode }: { saleId: string; barcode: string }) =>
      api.scanIntoSale(saleId, barcode),
    onSuccess: (res) => {
      replaceSaleInCache(qc, res.sale)
      flashScannedLine(res.scannedLineId)
    },
  })
}

export function useSetLineQty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      saleId,
      lineId,
      qty,
    }: {
      saleId: string
      lineId: string
      qty: number
    }) => api.setLineQty(saleId, lineId, qty),
    onSuccess: (sale) => replaceSaleInCache(qc, sale),
  })
}

export function useRemoveLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ saleId, lineId }: { saleId: string; lineId: string }) =>
      api.removeLine(saleId, lineId),
    onSuccess: (sale) => replaceSaleInCache(qc, sale),
  })
}

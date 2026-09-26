import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as api from "@/lib/api/transactions"
import { queryKeys } from "@/lib/api/query-keys"

export function useTransactionByNumber(saleNumber: number | null) {
  return useQuery({
    queryKey: queryKeys.transactions.byNumber(saleNumber ?? -1),
    queryFn: () => api.getTransactionByNumber(saleNumber as number),
    enabled: saleNumber != null,
    // A committed receipt is immutable until voided -- no point refetching a
    // detail the cashier is just reading.
    staleTime: Infinity,
  })
}

export function useCheckout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.checkout,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.openSales.all })
      qc.invalidateQueries({ queryKey: queryKeys.transactions.all })
    },
  })
}

// Also used for reprint: printing is stateless, so the same call both prints a
// fresh receipt and reprints an existing one.
export function usePrintTransaction() {
  return useMutation({
    mutationFn: (id: string) => api.printTransaction(id),
  })
}

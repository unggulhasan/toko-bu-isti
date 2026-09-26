import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import * as api from "@/lib/api/transactions"
import { queryKeys } from "@/lib/api/query-keys"
import type { TransactionStatus } from "@/lib/types"

export function useTransactions(params: {
  page: number
  statusFilter: TransactionStatus | "all"
}) {
  return useQuery({
    queryKey: queryKeys.transactions.list(params),
    queryFn: () => api.listTransactions(params),
    placeholderData: keepPreviousData,
  })
}

export function useTransactionSummary() {
  return useQuery({
    queryKey: queryKeys.transactions.summary(),
    queryFn: () => api.getSummary({}),
  })
}

export function useTransaction(id: string | null) {
  return useQuery({
    queryKey: queryKeys.transactions.detail(id ?? ""),
    queryFn: () => api.getTransaction(id as string),
    enabled: id != null,
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
      // Both halves matter: the server deleted the open sale (strip must
      // drop it) and there's a new row + new summary numbers (transactions
      // page must show it). Forgetting either leaves visibly stale UI.
      qc.invalidateQueries({ queryKey: queryKeys.openSales.all })
      qc.invalidateQueries({ queryKey: queryKeys.transactions.all })
    },
  })
}

export function useVoidTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.voidTransaction(id),
    onSuccess: (txn) => {
      qc.setQueryData(queryKeys.transactions.detail(txn.id), txn)
      qc.invalidateQueries({ queryKey: queryKeys.transactions.all })
    },
  })
}

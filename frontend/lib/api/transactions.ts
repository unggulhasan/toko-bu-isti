import { qs, request } from "@/lib/api/client"
import type {
  Page,
  Transaction,
  TransactionListItem,
  TransactionSummary,
  TransactionStatus,
} from "@/lib/types"

export function checkout(input: {
  openSaleId: string
  tendered: number
}): Promise<Transaction> {
  return request("/api/transactions", {
    method: "POST",
    body: input,
    withCashier: true,
  })
}

export function listTransactions(params: {
  page?: number
  pageSize?: number
  statusFilter?: TransactionStatus | "all"
  from?: string
  to?: string
}): Promise<Page<TransactionListItem>> {
  // status_filter is the one query param on this API that stayed snake_case
  // (backend/app/routers/transactions.py:61, no alias=). Typo'd as
  // "statusFilter" it is silently dropped by FastAPI and the filter appears
  // broken with no error -- keep this the one place that translates it.
  const query = new URLSearchParams(
    qs({
      page: params.page,
      pageSize: params.pageSize,
      from: params.from,
      to: params.to,
    }).slice(1)
  )
  if (params.statusFilter) query.set("status_filter", params.statusFilter)
  const s = query.toString()
  return request(`/api/transactions${s ? `?${s}` : ""}`)
}

export function getTransaction(id: string): Promise<Transaction> {
  return request(`/api/transactions/${id}`)
}

export function voidTransaction(id: string): Promise<Transaction> {
  return request(`/api/transactions/${id}/void`, {
    method: "POST",
    withCashier: true,
  })
}

export function getSummary(params: {
  from?: string
  to?: string
}): Promise<TransactionSummary> {
  return request(`/api/transactions/summary${qs(params)}`)
}

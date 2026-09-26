import { qs, request } from "@/lib/api/client"
import type { Transaction } from "@/lib/types"

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

export function getTransaction(id: string): Promise<Transaction> {
  return request(`/api/transactions/${id}`)
}

export function getTransactionByNumber(saleNumber: number): Promise<Transaction> {
  return request(`/api/transactions/by-number/${saleNumber}`)
}

export function printTransaction(id: string): Promise<{ ok: boolean }> {
  return request(`/api/transactions/${id}/print`, {
    method: "POST",
  })
}

export function reportUrl(date: string): string {
  return `/api/transactions/report${qs({ date })}`
}

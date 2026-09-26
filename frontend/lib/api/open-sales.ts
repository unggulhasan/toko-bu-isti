import { request } from "@/lib/api/client"
import type { OpenSale, ScanResult } from "@/lib/types"

// Returns {items: []} when there are none and NEVER auto-creates -- the
// caller is responsible for POSTing when the list comes back empty (see
// lib/hooks/use-open-sales.ts's bootstrap effect).
export function listOpenSales(): Promise<{ items: OpenSale[] }> {
  return request("/api/open-sales")
}

export function createOpenSale(): Promise<OpenSale> {
  return request("/api/open-sales", { method: "POST" })
}

export function getOpenSale(id: string): Promise<OpenSale> {
  return request(`/api/open-sales/${id}`)
}

// 204, no replacement cart -- the caller must pick/create the next active one.
export function deleteOpenSale(id: string): Promise<void> {
  return request(`/api/open-sales/${id}`, { method: "DELETE" })
}

export function scanIntoSale(
  saleId: string,
  barcode: string
): Promise<ScanResult> {
  return request(`/api/open-sales/${saleId}/scan`, {
    method: "POST",
    body: { barcode },
  })
}

// qty <= 0 deletes the line server-side. Returns the whole cart either way.
export function setLineQty(
  saleId: string,
  lineId: string,
  qty: number
): Promise<OpenSale> {
  return request(`/api/open-sales/${saleId}/lines/${lineId}`, {
    method: "PATCH",
    body: { qty },
  })
}

// 200 WITH a body -- unlike every other delete in this API.
export function removeLine(saleId: string, lineId: string): Promise<OpenSale> {
  return request(`/api/open-sales/${saleId}/lines/${lineId}`, {
    method: "DELETE",
  })
}

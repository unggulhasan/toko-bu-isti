import { qs, request } from "@/lib/api/client"
import type { Page, Product, ProductImportResult, ProductInput } from "@/lib/types"

export function listProducts(params: {
  q?: string
  page?: number
  pageSize?: number
  includeInactive?: boolean
}): Promise<Page<Product>> {
  return request(
    `/api/products${qs({
      q: params.q,
      page: params.page,
      pageSize: params.pageSize,
      includeInactive: params.includeInactive,
    })}`
  )
}

export function getProductByBarcode(barcode: string): Promise<Product> {
  return request(`/api/products/barcode/${encodeURIComponent(barcode)}`)
}

// Bare array, not the Page envelope -- name-only search (backend/app/routers/products.py).
export function searchProducts(q: string, limit = 10): Promise<Product[]> {
  return request(`/api/products/search${qs({ q, limit })}`)
}

// `updatedBy` is never sent -- the server derives it from X-Cashier-Id.
export function createProduct(input: ProductInput): Promise<Product> {
  return request("/api/products", {
    method: "POST",
    body: input,
    withCashier: true,
  })
}

export function updateProduct(
  id: string,
  input: Partial<ProductInput>
): Promise<Product> {
  return request(`/api/products/${id}`, {
    method: "PATCH",
    body: input,
    withCashier: true,
  })
}

// No X-Cashier-Id -- documented asymmetry vs create/update (soft delete).
export function deleteProduct(id: string): Promise<void> {
  return request(`/api/products/${id}`, { method: "DELETE" })
}

// Backup and restore are gated by hardcoded passwords the backend checks from
// the X-Backup-Password header (backend/app/dependencies.py). The export can
// therefore no longer be a plain URL: it is fetched with the header and saved
// from the returned Blob.
const PASSWORD_HEADER = "X-Backup-Password"

export function exportProducts(password: string): Promise<Blob> {
  return request("/api/products/export", {
    blob: true,
    headers: { [PASSWORD_HEADER]: password },
  })
}

// `rawBody` sends the file's own JSON text verbatim -- it must not be
// re-JSON.stringify'd, which `body` would do.
export function importProducts(
  fileText: string,
  password: string
): Promise<ProductImportResult> {
  return request("/api/products/import", {
    method: "POST",
    rawBody: fileText,
    withCashier: true,
    headers: { [PASSWORD_HEADER]: password },
  })
}

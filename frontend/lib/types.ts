// Mirrors the backend's wire format exactly (backend/app/schemas/*.py). Every
// JSON body is camelCase; money is integer rupiah; datetimes are ISO strings
// with a trailing Z.

export type Cashier = {
  id: string
  name: string
}

export type Page<T> = {
  items: T[]
  total: number
  page: number // 0-based
  pageSize: number
  pageCount: number
}

export type Product = {
  id: string
  barcode: string
  name: string
  price: number
  updatedAt: string
  updatedBy: string
}

export type ProductInput = {
  barcode: string
  name: string
  price: number
}

export type SaleLine = {
  id: string
  // Nullable: the FK is ON DELETE SET NULL, so a line survives its catalog
  // product being soft-deleted.
  productId: string | null
  barcode: string
  name: string
  price: number
  qty: number
}

export type OpenSale = {
  id: string
  createdAt: string
  // Monotonically increasing append order (max(position) + 1). Never
  // renumbered on delete, so it can show gaps after a cart is removed -- it is
  // the API's sort key, not a UI label. See open-sales-strip.tsx.
  position: number
  lines: SaleLine[]
  // Server-computed. Prefer these over lib/pos-calculations.ts helpers
  // wherever an OpenSale is already in hand.
  total: number
  units: number
  lineCount: number
}

export type ScanResult = {
  sale: OpenSale
  scannedLineId: string
  created: boolean
}

export type TransactionStatus = "completed" | "voided"

// Shared shape between the list item and the detail; the list omits `lines`
// for payload size (see GET /api/transactions) but includes a `units`
// aggregate for the "Barang" column.
type TransactionBase = {
  id: string
  saleNumber: number // never null -- allocated server-side at checkout
  total: number
  tendered: number
  change: number
  units: number
  cashierName: string
  createdAt: string
  status: TransactionStatus
  voidedAt: string | null
  voidedBy: string | null
}

export type TransactionListItem = TransactionBase

export type Transaction = TransactionBase & {
  lines: SaleLine[]
}

export type TransactionSummary = {
  salesCount: number
  gross: number
  cashInDrawer: number
  voidedCount: number
}

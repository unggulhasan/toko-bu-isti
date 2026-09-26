export type Product = {
  id: string
  barcode: string
  name: string
  price: number
  updatedAt: string
  updatedBy: string
}

export type SaleLine = {
  id: string
  productId: string
  barcode: string
  name: string
  price: number
  qty: number
}

export type OpenSale = {
  id: string
  lines: SaleLine[]
  createdAt: string
}

export type Transaction = {
  id: string
  saleNumber: number | null
  lines: SaleLine[]
  total: number
  tendered: number
  change: number
  cashierName: string
  createdAt: string
  status: "completed" | "voided"
}

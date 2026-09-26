"use client"

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatRupiah } from "@/lib/format"
import type { Product } from "@/lib/types"

export type ProductsTableHandle = {
  moveSelection: (delta: number) => void
  activateSelection: () => void
}

export const ProductsTable = forwardRef<
  ProductsTableHandle,
  { products: Product[]; onEdit: (product: Product) => void }
>(function ProductsTable({ products, onEdit }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Products change on search/page changes; keep the selection in range
  // rather than pointing at a row that no longer exists.
  useEffect(() => {
    setSelectedIndex(0)
  }, [products])

  useImperativeHandle(ref, () => ({
    moveSelection: (delta) => {
      if (products.length === 0) return
      setSelectedIndex((i) =>
        Math.min(Math.max(i + delta, 0), products.length - 1)
      )
    },
    activateSelection: () => {
      const product = products[selectedIndex]
      if (product) onEdit(product)
    },
  }))

  return (
    <div className="overflow-hidden rounded-none border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-42.5">Barkode</TableHead>
            <TableHead>Nama</TableHead>
            <TableHead className="w-40 text-right">Harga</TableHead>
            <TableHead className="w-21" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product, index) => (
            <TableRow
              key={product.id}
              onClick={() => setSelectedIndex(index)}
              onDoubleClick={() => onEdit(product)}
              className={cn(
                "cursor-pointer",
                index === selectedIndex && "bg-primary/8"
              )}
            >
              <TableCell className="font-mono text-[15px] text-muted-foreground">
                {product.barcode}
              </TableCell>
              <TableCell className="text-[17px] text-foreground">
                {product.name}
              </TableCell>
              <TableCell className="text-right font-mono text-[17px]">
                {formatRupiah(product.price)}
              </TableCell>
              <TableCell className="text-right">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(product)
                  }}
                  className="text-[15px] text-primary"
                >
                  Ubah
                </button>
              </TableCell>
            </TableRow>
          ))}
          {products.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                Tidak ada produk yang cocok.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
})

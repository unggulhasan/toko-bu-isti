"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatRupiah } from "@/lib/format"
import type { Product } from "@/lib/types"

export function ProductsTable({
  products,
  onEdit,
}: {
  products: Product[]
  onEdit: (product: Product) => void
}) {
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
          {products.map((product) => (
            <TableRow key={product.id}>
              <TableCell className="font-mono text-[12.5px] text-muted-foreground">
                {product.barcode}
              </TableCell>
              <TableCell className="text-[14px] text-foreground">
                {product.name}
              </TableCell>
              <TableCell className="text-right font-mono text-[14px]">
                {formatRupiah(product.price)}
              </TableCell>
              <TableCell className="text-right">
                <button
                  type="button"
                  onClick={() => onEdit(product)}
                  className="text-[12.5px] text-primary"
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
}

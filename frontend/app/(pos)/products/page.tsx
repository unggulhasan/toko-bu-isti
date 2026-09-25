"use client"

import { useMemo, useState } from "react"

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { ProductSearchBar } from "@/components/pos/product-search-bar"
import { ProductsTable } from "@/components/pos/products-table"
import { ProductFormDialog } from "@/components/pos/product-form-dialog"
import { useProducts } from "@/lib/state/products-provider"
import type { Product } from "@/lib/types"

const PAGE_SIZE = 8

export default function ProductsPage() {
  const { products } = useProducts()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q)
    )
  }, [products, query])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  )

  function openNewProduct() {
    setEditingProduct(null)
    setDialogOpen(true)
  }

  function openEditProduct(product: Product) {
    setEditingProduct(product)
    setDialogOpen(true)
  }

  return (
    <div className="px-6.5 py-6">
      <div className="mb-4.5 flex items-end justify-between">
        <div>
          <div className="text-[23px] font-semibold tracking-tight text-foreground">
            Produk
          </div>
          <div className="mt-1 text-[12.5px] text-muted-foreground">
            {products.length} produk
          </div>
        </div>
        <ProductSearchBar
          query={query}
          onQueryChange={(value) => {
            setQuery(value)
            setPage(0)
          }}
          onNewProduct={openNewProduct}
        />
      </div>
      <ProductsTable products={pageItems} onEdit={openEditProduct} />
      <div className="mt-3.5 flex items-center justify-between text-[12.5px] text-muted-foreground">
        <span>
          Menampilkan {pageItems.length} dari {filtered.length}
        </span>
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                text=""
                onClick={(e) => {
                  e.preventDefault()
                  setPage((p) => Math.max(0, p - 1))
                }}
                aria-disabled={currentPage === 0}
              />
            </PaginationItem>
            {Array.from({ length: pageCount }, (_, i) => (
              <PaginationItem key={i}>
                <PaginationLink
                  isActive={i === currentPage}
                  onClick={(e) => {
                    e.preventDefault()
                    setPage(i)
                  }}
                >
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                text=""
                onClick={(e) => {
                  e.preventDefault()
                  setPage((p) => Math.min(pageCount - 1, p + 1))
                }}
                aria-disabled={currentPage === pageCount - 1}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
      <ProductFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editingProduct}
      />
    </div>
  )
}

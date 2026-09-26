"use client"

import { useEffect, useState } from "react"

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
import { useProducts } from "@/lib/hooks/use-products"
import type { Product } from "@/lib/types"

const PAGE_SIZE = 8
// The search bar is a controlled input rendering on every keystroke; the
// debounce lives here so typing doesn't refetch on each character.
const DEBOUNCE_MS = 250

export default function ProductsPage() {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const { data, isLoading } = useProducts({
    q: debouncedQuery,
    page,
    pageSize: PAGE_SIZE,
  })

  const pageItems = data?.items ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, data?.pageCount ?? 1)

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
            {/* total is now the filtered count once q is set -- relabel so
                it doesn't read as the whole catalog size while searching. */}
            {debouncedQuery.trim() ? `${total} hasil` : `${total} produk`}
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
          {isLoading
            ? "Memuat…"
            : `Menampilkan ${pageItems.length} dari ${total}`}
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
                aria-disabled={page === 0}
              />
            </PaginationItem>
            {Array.from({ length: pageCount }, (_, i) => (
              <PaginationItem key={i}>
                <PaginationLink
                  isActive={i === page}
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
                aria-disabled={page === pageCount - 1}
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

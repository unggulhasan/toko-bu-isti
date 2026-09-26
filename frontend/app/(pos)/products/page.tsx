"use client"

import { useEffect, useRef, useState } from "react"

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { ProductSearchBar } from "@/components/pos/product-search-bar"
import {
  ProductsTable,
  type ProductsTableHandle,
} from "@/components/pos/products-table"
import { ProductFormDialog } from "@/components/pos/product-form-dialog"
import { useProducts } from "@/lib/hooks/use-products"
import type { Product } from "@/lib/types"

const PAGE_SIZE = 10
// The search bar is a controlled input rendering on every keystroke; the
// debounce lives here so typing doesn't refetch on each character.
const DEBOUNCE_MS = 250

// Builds a windowed page list (first, last, current +/- 1 neighbor) with
// `null` standing in for an ellipsis, so the pager doesn't overflow when
// there are many pages.
function getPaginationRange(page: number, pageCount: number): (number | null)[] {
  const siblingCount = 1
  const totalVisible = siblingCount * 2 + 5

  if (pageCount <= totalVisible) {
    return Array.from({ length: pageCount }, (_, i) => i)
  }

  const leftIndex = Math.max(page - siblingCount, 1)
  const rightIndex = Math.min(page + siblingCount, pageCount - 2)

  const range: (number | null)[] = [0]

  range.push(leftIndex > 1 ? null : 1)
  for (let i = leftIndex; i <= rightIndex; i++) {
    if (i > 0 && i < pageCount - 1) range.push(i)
  }
  range.push(rightIndex < pageCount - 2 ? null : pageCount - 2)

  range.push(pageCount - 1)

  return Array.from(new Set(range.filter((v) => v === null || (v >= 0 && v < pageCount)))).reduce<
    (number | null)[]
  >((acc, v) => {
    if (v === null && acc[acc.length - 1] === null) return acc
    acc.push(v)
    return acc
  }, [])
}

export default function ProductsPage() {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const tableRef = useRef<ProductsTableHandle>(null)

  useEffect(() => {
    // A leading "/" starts a command (e.g. /baru) in ProductSearchBar, not a
    // search -- don't debounce it into a query and refetch products.
    if (query.startsWith("/")) return
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
      <div className="mb-2 text-[12.5px] text-muted-foreground">
        {/* total is now the filtered count once q is set -- relabel so
            it doesn't read as the whole catalog size while searching. */}
        {debouncedQuery.trim() ? `${total} hasil` : `${total} produk`}
      </div>
      <div className="mb-4.5">
        <ProductSearchBar
          query={query}
          onQueryChange={(value) => {
            setQuery(value)
            setPage(0)
          }}
          onNewProduct={openNewProduct}
          onNavigate={(delta) => tableRef.current?.moveSelection(delta)}
          onActivate={() => tableRef.current?.activateSelection()}
          onPageChange={(delta) =>
            setPage((p) => Math.min(Math.max(p + delta, 0), pageCount - 1))
          }
        />
      </div>
      <ProductsTable
        ref={tableRef}
        products={pageItems}
        onEdit={openEditProduct}
      />
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
            {getPaginationRange(page, pageCount).map((i, idx) =>
              i === null ? (
                <PaginationItem key={`ellipsis-${idx}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
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
              )
            )}
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

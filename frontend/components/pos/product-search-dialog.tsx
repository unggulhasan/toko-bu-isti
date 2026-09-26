"use client"

import { useEffect, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import { useProductSearch } from "@/lib/hooks/use-products"
import { useScan } from "@/lib/hooks/use-open-sales"

const MAX_RESULTS = 10

export function ProductSearchDialog({
  open,
  onOpenChange,
  saleId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saleId: string | undefined
}) {
  const [query, setQuery] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const { data: results = [], isFetching } = useProductSearch(searchTerm)
  const scan = useScan()

  useEffect(() => {
    setHighlightedIndex(0)
  }, [searchTerm])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setSearchTerm("")
      setHighlightedIndex(0)
    }
  }, [open])

  function addProduct(index: number) {
    const product = results[index]
    if (!product || !saleId) return
    scan.mutate({ saleId, barcode: product.barcode })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" showCloseButton>
        <DialogHeader>
          <DialogTitle className="text-2xl">Cari barang</DialogTitle>
        </DialogHeader>
        <InputGroup className="h-16 border border-border px-4.5">
          <InputGroupInput
            autoFocus
            placeholder="Ketik nama barang…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (results.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setHighlightedIndex((i) => (i + 1) % results.length)
                  return
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setHighlightedIndex(
                    (i) => (i - 1 + results.length) % results.length
                  )
                  return
                }
              }
              if (e.key === "Enter") {
                e.preventDefault()
                if (results.length > 0 && searchTerm.trim() === query.trim()) {
                  addProduct(highlightedIndex)
                } else {
                  setSearchTerm(query)
                }
              }
            }}
            className="font-mono text-xl"
          />
          <InputGroupAddon align="inline-end">
            <span className="text-sm text-muted-foreground">
              {searchTerm.trim()
                ? "↑↓ pilih · Enter tambah"
                : "Enter untuk cari"}
            </span>
          </InputGroupAddon>
        </InputGroup>
        <div className="overflow-hidden rounded-none border border-border">
          {searchTerm.trim() && !isFetching && results.length === 0 ? (
            <div className="px-5 py-4 text-base text-muted-foreground">
              Tidak ditemukan
            </div>
          ) : isFetching ? (
            Array.from({ length: MAX_RESULTS }).map((_, index) => (
              <div
                key={index}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
              >
                <Skeleton className="h-5 w-48" />
                <span className="flex items-center gap-4">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                </span>
              </div>
            ))
          ) : (
            results.map((product, index) => {
              const isHighlighted = index === highlightedIndex
              return (
                <button
                  key={product.id}
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => addProduct(index)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 border-b border-border px-5 py-3.5 text-left last:border-b-0",
                    isHighlighted ? "bg-primary/8" : "bg-card"
                  )}
                >
                  <span className="text-lg text-foreground">
                    {product.name}
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="font-mono text-sm text-muted-foreground">
                      {formatNumber(product.price)}
                    </span>
                    <span className="font-mono text-sm text-muted-foreground">
                      {product.barcode}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

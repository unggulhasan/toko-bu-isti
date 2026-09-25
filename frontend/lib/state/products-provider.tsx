"use client"

import { createContext, useContext, useMemo } from "react"

import { useLocalStorageState } from "@/hooks/use-local-storage-state"
import { SEED_PRODUCTS } from "@/lib/data/seed-products"
import type { Product } from "@/lib/types"

type ProductInput = Omit<Product, "id" | "updatedAt" | "updatedBy">

type ProductsContextValue = {
  products: Product[]
  findByBarcode: (barcode: string) => Product | undefined
  addProduct: (input: ProductInput, updatedBy: string) => Product
  updateProduct: (id: string, input: ProductInput, updatedBy: string) => void
  deleteProduct: (id: string) => void
}

const ProductsContext = createContext<ProductsContextValue | null>(null)

export function ProductsProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useLocalStorageState<Product[]>(
    "pos:products",
    SEED_PRODUCTS
  )

  const value = useMemo<ProductsContextValue>(
    () => ({
      products,
      findByBarcode: (barcode) =>
        products.find((p) => p.barcode === barcode.trim()),
      addProduct: (input, updatedBy) => {
        const product: Product = {
          ...input,
          id: `p-${input.barcode}-${Date.now()}`,
          updatedAt: new Date().toISOString(),
          updatedBy,
        }
        setProducts((prev) => [...prev, product])
        return product
      },
      updateProduct: (id, input, updatedBy) => {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, ...input, updatedAt: new Date().toISOString(), updatedBy }
              : p
          )
        )
      },
      deleteProduct: (id) => {
        setProducts((prev) => prev.filter((p) => p.id !== id))
      },
    }),
    [products, setProducts]
  )

  return (
    <ProductsContext.Provider value={value}>
      {children}
    </ProductsContext.Provider>
  )
}

export function useProducts() {
  const ctx = useContext(ProductsContext)
  if (!ctx) throw new Error("useProducts must be used within ProductsProvider")
  return ctx
}

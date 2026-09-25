import { create } from "zustand"
import { persist } from "zustand/middleware"

import { SEED_PRODUCTS } from "@/lib/data/seed-products"
import type { Product } from "@/lib/types"

export type ProductInput = Omit<Product, "id" | "updatedAt" | "updatedBy">

type ProductsState = {
  products: Product[]
}

type ProductsActions = {
  findByBarcode: (barcode: string) => Product | undefined
  addProduct: (input: ProductInput, updatedBy: string) => Product
  updateProduct: (id: string, input: ProductInput, updatedBy: string) => void
  deleteProduct: (id: string) => void
}

export const useProductsStore = create<ProductsState & ProductsActions>()(
  persist(
    (set, get) => ({
      products: SEED_PRODUCTS,
      findByBarcode: (barcode) =>
        get().products.find((p) => p.barcode === barcode.trim()),
      addProduct: (input, updatedBy) => {
        const product: Product = {
          ...input,
          id: `p-${input.barcode}-${Date.now()}`,
          updatedAt: new Date().toISOString(),
          updatedBy,
        }
        set((state) => ({ products: [...state.products, product] }))
        return product
      },
      updateProduct: (id, input, updatedBy) => {
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id
              ? { ...p, ...input, updatedAt: new Date().toISOString(), updatedBy }
              : p
          ),
        }))
      },
      deleteProduct: (id) => {
        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
        }))
      },
    }),
    {
      name: "pos:products",
      skipHydration: true,
    }
  )
)

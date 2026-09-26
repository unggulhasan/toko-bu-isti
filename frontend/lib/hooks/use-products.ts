import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import * as api from "@/lib/api/products"
import { queryKeys } from "@/lib/api/query-keys"
import type { ProductInput } from "@/lib/types"

export function useProducts(params: {
  q: string
  page: number
  pageSize: number
}) {
  return useQuery({
    queryKey: queryKeys.products.list(params),
    queryFn: () => api.listProducts(params),
    placeholderData: keepPreviousData,
  })
}

export function useProductSearch(q: string) {
  return useQuery({
    queryKey: queryKeys.products.search(q),
    queryFn: () => api.searchProducts(q),
    enabled: q.trim().length > 0,
    staleTime: 60_000,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProductInput) => api.createProduct(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.products.all }),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ProductInput> }) =>
      api.updateProduct(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.products.all }),
    // Deliberately NOT invalidating open-sales: cart lines are denormalized
    // price snapshots by design (backend/app/routers/open_sales.py), so
    // editing a product's price must not change a parked cart.
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.products.all }),
  })
}

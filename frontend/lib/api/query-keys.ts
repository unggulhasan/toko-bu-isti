// Nested key factory so a prefix (e.g. queryKeys.products.all) invalidates
// every list/search/detail under it at once.

export const queryKeys = {
  products: {
    all: ["products"] as const,
    list: (params: { q: string; page: number; pageSize: number }) =>
      ["products", "list", params] as const,
    search: (q: string) => ["products", "search", q] as const,
    barcode: (barcode: string) => ["products", "barcode", barcode] as const,
  },
  openSales: {
    all: ["open-sales"] as const,
    list: () => ["open-sales", "list"] as const,
  },
  transactions: {
    all: ["transactions"] as const,
    list: (params: { page: number; statusFilter: string }) =>
      ["transactions", "list", params] as const,
    detail: (id: string) => ["transactions", "detail", id] as const,
    summary: () => ["transactions", "summary"] as const,
  },
}

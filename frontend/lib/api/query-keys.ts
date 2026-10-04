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
    // Keyed by cashier: carts are per cashier on the server, so another
    // cashier's cached list must never be served after switching users.
    list: (cashierId: string) => ["open-sales", "list", cashierId] as const,
  },
  transactions: {
    all: ["transactions"] as const,
    detail: (id: string) => ["transactions", "detail", id] as const,
    byNumber: (saleNumber: number) =>
      ["transactions", "by-number", saleNumber] as const,
  },
}

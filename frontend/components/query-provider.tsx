"use client"

import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { useSessionStore } from "@/lib/store/session-store"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Created in a useState initializer so it's per-browser-session, never
  // shared across server requests -- this app is client-rendered throughout,
  // but the pattern is what TanStack Query docs recommend regardless.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // LAN + two terminals: 30s is fresh enough without hammering the
            // single Firebird box on every render.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            // A 404/409/etc is a real answer, not a blip -- only retry actual
            // network failures (backend unreachable), and only a couple of
            // times.
            retry: (count, err) =>
              err instanceof ApiError && err.kind === "network" && count < 2,
            // The cashier tabs away and back constantly, and the other
            // terminal may have changed open sales in the meantime.
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
          mutations: {
            // Checkout is not idempotent: a retried POST /transactions after a
            // timeout would allocate a second saleNumber. No mutation in this
            // app is safe to auto-retry.
            retry: 0,
          },
        },
      })
  )

  // The one store left with skipHydration: true. With products/sales/
  // transactions stores gone, this is the only rehydrate call needed, so it's
  // inlined here rather than kept in a separate StoreHydrator component.
  useEffect(() => {
    useSessionStore.persist.rehydrate()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

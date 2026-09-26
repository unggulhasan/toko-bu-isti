"use client"

import { useEffect } from "react"

import { useProductsStore } from "@/lib/store/products-store"
import { useSalesStore } from "@/lib/store/sales-store"
import { useSessionStore } from "@/lib/store/session-store"
import { useTransactionsStore } from "@/lib/store/transactions-store"

export function StoreHydrator() {
  useEffect(() => {
    useProductsStore.persist.rehydrate()
    useSalesStore.persist.rehydrate()
    useTransactionsStore.persist.rehydrate()
    useSessionStore.persist.rehydrate()
  }, [])

  return null
}

"use client"

import { useEffect } from "react"

import { useProductsStore } from "@/lib/store/products-store"
import { useSalesStore } from "@/lib/store/sales-store"
import { useTransactionsStore } from "@/lib/store/transactions-store"

export function StoreHydrator() {
  useEffect(() => {
    useProductsStore.persist.rehydrate()
    useSalesStore.persist.rehydrate()
    useTransactionsStore.persist.rehydrate()
  }, [])

  return null
}
